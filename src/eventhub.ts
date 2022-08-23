/*
The MIT License (MIT)
Copyright (c) 2022 Ole Fredrik Skudsvik <ole.skudsvik@gmail.com>
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

import WebSocket, { MessageEvent, ErrorEvent, CloseEvent } from 'isomorphic-ws';
import mitt, { Emitter, Handler } from 'mitt';

declare type RPCCallback = (err: string, message: any) => void;
declare type SubscriptionCallback = (message: any) => void;

const enum RPCMethods {
  PUBLISH = 'publish',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  UNSUBSCRIBE_ALL = 'unsubscribeAll',
  LIST = 'list',
  EVENTLOG = 'eventlog',
  GET = 'get',
  SET = 'set',
  DEL = 'del',
  PING = 'ping',
  DISCONNECT = 'disconnect',
}

const enum LifecycleEvents {
  CONNECT = 'connect',
  RECONNECT = 'reconnect',
  DISCONNECT = 'disconnect',
  OFFLINE = 'offline',
}

interface Subscription {
  topic: string;
  rpcRequestId: number;
  callback: SubscriptionCallback;
  lastRecvMessageId?: string;
}

interface PingRequest {
  timestamp: number;
  rpcRequestId: number;
}

class ConnectionOptions {
  pingInterval: number = 10000;
  pingTimeout: number = 3000;
  maxFailedPings: number = 3;
  reconnectInterval: number = 10000;
  disablePingCheck: boolean = false;
}

interface SubscribeOptions {
  topic: string;
  sinceEventId?: string;
  since?: number;
}

interface EventlogOptions extends SubscribeOptions {
}

interface MessageResult {
    id: string;
    topic: string;
    message: any;
    origin: string;
}

interface SubscribeResult {
    action: 'subscribe';
    status: string;
    topic: string;
}

interface EventlogResult {
  action: 'Eventlog';
  status: string;
  topic: string;
  result: Array<MessageResult>
}

declare interface IEventhub {}

type MittEvents = {
  [LifecycleEvents.CONNECT]: void;
  [LifecycleEvents.OFFLINE]: ErrorEvent | CloseEvent;
  [LifecycleEvents.RECONNECT]: void;
  [LifecycleEvents.DISCONNECT]: void;
};

class Eventhub implements IEventhub {
  private _wsUrl: string;
  private _socket: WebSocket;
  private _opts: ConnectionOptions = new ConnectionOptions();
  private _isConnected: boolean = false;
  private _manuallyDisconnected: boolean = false;

  private _rpcResponseCounter: number = 0;
  private _rpcCallbackList: Map<number, RPCCallback> = new Map();
  private _subscriptionCallbackList: Subscription[] = [];

  private _sentPingsList: PingRequest[] = [];
  private _pingTimer: any;
  private _pingTimeOutTimer: any;
  private _emitter: Emitter<MittEvents>;

  /**
   * Constructor (new Eventhub).
   * @param url Eventhub websocket url.
   * @param token Authentication token.
   * @param opts Options.
   */
  constructor(url: string, token?: string, opts?: { [P in keyof ConnectionOptions]?: ConnectionOptions[P] }) {
    this._wsUrl = `${url}/?auth=${token}`;
    this._opts = new ConnectionOptions();
    this._emitter = mitt(); // event emitter

    Object.assign(this._opts, opts);
  }

  /**
   * Connect to eventhub.
   * @returns Promise with true on success or error string on fail.
   */
  public connect(): Promise<true> {
    this._manuallyDisconnected = false;

    return new Promise((resolve, reject) => {
      this._socket = new WebSocket(this._wsUrl);
      this._socket.onmessage = this._parseRPCResponse.bind(this);

      this._socket.onopen = () => {
        this._emitter.emit(LifecycleEvents.CONNECT);

        this._isConnected = true;

        if (!this._opts.disablePingCheck) {
          this._startPingMonitor();
        }

        resolve(true);
      };

      this._socket.onerror = (err: ErrorEvent) => {
        this._emitter.emit(LifecycleEvents.OFFLINE, err);

        if (this._isConnected) {
          console.warn('Eventhub WebSocket connection error:', err);
          this._isConnected = false;

          this._reconnect();
        } else {
          reject(err);
        }
      };

      this._socket.onclose = (err: CloseEvent) => {
        if (this._isConnected) {
          this._emitter.emit(LifecycleEvents.OFFLINE, err);

          this._isConnected = false;
          this._reconnect();
        }
      };
    });
  }

  /*
   * Try to reconnect in a loop until we succeed.
   */
  private _reconnect(): void {
    if (this._isConnected || this._manuallyDisconnected) return;

    this._emitter.emit(LifecycleEvents.RECONNECT);

    const { reconnectInterval } = this._opts;

    if (
      this._socket.readyState != WebSocket.CLOSED &&
      this._socket.readyState != WebSocket.CLOSING
    ) {
      this._socket.close();
    }

    this._resetPingMonitor();

    this.connect()
      .then((_res) => {
        const oldSubscriptions = this._subscriptionCallbackList.slice();
        this._rpcResponseCounter = 0;
        this._rpcCallbackList = new Map();
        this._subscriptionCallbackList = [];

        for (const sub of oldSubscriptions) {
          this.subscribe(sub.topic, sub.callback, {
            sinceEventId: sub.lastRecvMessageId,
          });
        }
      })
      .catch((_err) => {
        setTimeout(this._reconnect.bind(this), reconnectInterval);
      });
  }

  /*
   * Send pings to the server on the configured interval.
   * Mark the client as disconnected if <_opts.maxFailedPings> pings fail.
   * Also trigger the reconnect procedure.
   */
  private _startPingMonitor(): void {
    const { pingInterval, maxFailedPings } = this._opts;

    // Ping server each <pingInterval> second.
    this._pingTimer = setInterval(() => {
      if (!this._isConnected) {
        return;
      }

      const pingReq: PingRequest = {
        timestamp: Date.now(),
        rpcRequestId: this._rpcResponseCounter + 1,
      };

      this._sentPingsList.push(pingReq);
      this._sendRPCRequest<{ pong: number }>(RPCMethods.PING, []).then((_pong) => {
        for (let i = 0; i < this._sentPingsList.length; i++) {
          if (this._sentPingsList[i].rpcRequestId == pingReq.rpcRequestId) {
            this._sentPingsList.splice(i, 1);
            break;
          }
        }
      });
    }, pingInterval);

    // Check that our pings is successfully ponged by the server.
    // disconnect and reconnect if maxFailedPings is reached.
    this._pingTimeOutTimer = setInterval(() => {
      const now = Date.now();
      let failedPingCount = this._sentPingsList.filter(
        (ping: PingRequest) => now > ping.timestamp + this._opts.pingTimeout
      ).length;

      if (failedPingCount >= maxFailedPings) {
        this._isConnected = false;
        this._reconnect();
      }
    }, pingInterval);
  }

  private _resetPingMonitor(): void {
    if (!this._opts.disablePingCheck) {
      clearInterval(this._pingTimer);
      clearInterval(this._pingTimeOutTimer);

      this._sentPingsList = [];
    }
  }

  /**
   * Send a RPC request to the connected Eventhub.
   * @param method Which RPCMethod to call.
   * @param params What parameters to include with the call.
   * @return Promise with response or error.
   */
  private _sendRPCRequest<T = any>(method: RPCMethods, params: any): Promise<T> {
    const requestObject = {
      id: ++this._rpcResponseCounter,
      jsonrpc: '2.0',
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      if (this._socket.readyState != WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected.'));
        return;
      }

      this._rpcCallbackList.set(
        requestObject.id,
        (err: string, resp: T) => {
          if (err != null) {
            reject(err);
          } else {
            resolve(resp);
          }
        }
      );

      try {
        this._socket.send(JSON.stringify(requestObject));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Parse incoming websocket response and call correct handlers.
   * @param response Response string.
   */
  private _parseRPCResponse(response: MessageEvent): void {
    try {
      const responseObj: Partial<{
        id: any;
        error: any;
        result: MessageResult | any;
      }> = JSON.parse(response.data.toString());

      if (!responseObj.hasOwnProperty('id') || responseObj.id == 'null') {
        return;
      }

      // If this is a message event then check if we are
      // subscribed and call the corrrect callback.
      if (
        responseObj.hasOwnProperty('result') &&
        responseObj.result.hasOwnProperty('message') &&
        responseObj.result.hasOwnProperty('topic')
      ) {
        for (const subscription of this._subscriptionCallbackList) {
          if (subscription.rpcRequestId == responseObj.id) {
            subscription.lastRecvMessageId = responseObj.result.id;
            subscription.callback(responseObj.result as MessageResult);
            return;
          }
        }
      }

      // This is not a message event, see if we have a callback for it.
      let rpcCallback = this._rpcCallbackList.get(responseObj.id);

      // We have no callback for the response, do nothing.
      if (!rpcCallback) {
        return;
      }

      // We have a callback for the response, call it.
      if (responseObj.hasOwnProperty('error')) {
        rpcCallback(responseObj.error, null);
      } else if (responseObj.hasOwnProperty('result')) {
        rpcCallback(null, responseObj.result);
      }

      // Remove the callback once it has been called.
      this._rpcCallbackList.delete(responseObj.id);
    } catch (err) {
      console.warn('Failed to parse websocket response:', err);
    }
  }

  /**
   * Check if we are already subscribed to a topic.
   * @param topic Topic.
   */
  public isSubscribed(topic: string) {
    return this._subscriptionCallbackList.some((sub) => sub.topic == topic);
  }

  /**
   * Subscribe to a topic pattern.
   * @param topic Topic to subscribe to.
   * @param callback Callback to call when we receive a message the subscribed topic.
   * @param opts Options to send with the request.
   * @returns Promise with success or callback.
   */
  public async subscribe(
    topic: string,
    callback: SubscriptionCallback,
    opts?: Omit<SubscribeOptions, 'topic'>
  ): Promise<SubscribeResult> {
    if (!topic) {
      throw new Error('Topic cannot be empty.');
    }

    let subscribeRequest: SubscribeOptions = {
      topic,
    };

    if (opts) {
      Object.assign(subscribeRequest, opts);
    }

    // First check if we are already subscribed to the topic.
    if (this.isSubscribed(topic)) {
      throw new Error(`Already subscribed to ${topic}`);
    }

    this._subscriptionCallbackList.push({
      topic,
      rpcRequestId: this._rpcResponseCounter + 1,
      callback,
    });

    return this._sendRPCRequest<SubscribeResult>(RPCMethods.SUBSCRIBE, subscribeRequest);
  }

  /**
   * Unsubscribe to one or more topic patterns.
   * @param topics Array of topics or single topic to unsubscribe from.
   */
  public unsubscribe(topics: string[] | string): void {
    const topicList: string[] = Array.isArray(topics) ? topics : [topics];
    if (topicList.length > 0) {
      this._subscriptionCallbackList = this._subscriptionCallbackList.filter(
        (cb) => !topicList.includes(cb.topic)
      );

      this._sendRPCRequest(RPCMethods.UNSUBSCRIBE, topicList);
    }
  }

  /**
   * Unsubscribe from all topics.
   */
  public unsubscribeAll(): void {
    this._subscriptionCallbackList = [];
    this._sendRPCRequest(RPCMethods.UNSUBSCRIBE_ALL, []);
  }

  /**
   * Publish a message.
   * @param topic Topic to publish to.
   * @param message Message to publish.
   * @param opts Options to send with the request.
   */
  public publish(topic: string, message: string, opts?: Object): Promise<any> {
    const publishRequest = {
      topic,
      message,
    };

    if (opts) {
      Object.assign(publishRequest, opts);
    }

    return this._sendRPCRequest(RPCMethods.PUBLISH, publishRequest);
  }

  /**
   * List all current subscriptions.
   * @return Array containing current subscribed topics.
   */
  public listSubscriptions(): Promise<string[]> {
    return this._sendRPCRequest<string[]>(RPCMethods.LIST, []);
  }

/**
 * Get cached events for a topic or pattern.
 * @param topic Topic.
 * @param opts Options to send with the request.
 * @returns Promise with success or error.
 */
  public async getEventlog(
    topic: string,
    opts: Omit<EventlogOptions, 'topic'>
  ): Promise<EventlogResult> {

    if (!topic) {
      throw new Error('Topic cannot be empty.');
    }

    if (!('since' in opts) && !('sinceEventId' in opts)) {
      throw new Error('You need to specify either since or sinceEventId.');
    }

    if (('since' in opts) && ('sinceEventId' in opts)) {
      throw new Error('You need to specify either since or sinceEventId, not both at the same time.');
    }

    let EventlogRequest: EventlogOptions = {
      topic,
    };

    Object.assign(EventlogRequest, opts);

    return this._sendRPCRequest<EventlogResult>(RPCMethods.EVENTLOG, EventlogRequest);
  }

  /**
   * Get key from key/value store.
   * @param key Key to fetch.
   */
  public get(key: string): Promise<any> {
    return this._sendRPCRequest(RPCMethods.GET, { key: key });
  }

  /**
   * Set key in key/value store.
   * @param key Key to set.
   */
  public set(key: string, value: string, ttl?: number): Promise<any> {
    const setRequest: Record<string, any> = {
      key,
      value,
    };

    if (ttl > 0) {
      setRequest.ttl = ttl;
    }

    return this._sendRPCRequest(RPCMethods.SET, setRequest);
  }

  /**
   * Delete key from key/value store.
   * @param key Key to delete.
   */
  public del(key: string): Promise<any> {
    return this._sendRPCRequest(RPCMethods.DEL, { key });
  }

  /**
   * Close connection to Eventhub
   */
   public async disconnect(): Promise<void> {
    this._manuallyDisconnected = true;

    if (this._isConnected || this._socket.readyState === WebSocket.CONNECTING) {
      this._isConnected = false;

      await new Promise(resolve => {
        const forceCloseTimeoutId = setTimeout(() => {
          if (
            this._socket.readyState != WebSocket.CLOSED &&
            this._socket.readyState != WebSocket.CLOSING
          ) {
            this._socket.close();
          }
        }, 1000);

        this._socket.onclose = () => {
          clearTimeout(forceCloseTimeoutId);
          resolve(true);
        };

        this._socket.onerror = () => {
          clearTimeout(forceCloseTimeoutId);
          resolve(true);
        };

        this._sendRPCRequest(RPCMethods.DISCONNECT, []).catch(() => {});
      });
    }

    this._socket.onopen = null;
    this._socket.onmessage = null;
    this._socket.onclose = null;
    this._socket.onerror = null;

    this._rpcResponseCounter = 0;
    this._rpcCallbackList = new Map();
    this._subscriptionCallbackList = [];

    this._resetPingMonitor();

    this._emitter.emit(LifecycleEvents.DISCONNECT);
  }

  /**
   * Add event handler
   */
  public on<Key extends keyof MittEvents>(
    type: Key,
    handler: Handler<MittEvents[Key]>
  ): this {
    this._emitter.on(type, handler);
    return this;
  }

  /**
   * Remove event handler
   */
  public off<Key extends keyof MittEvents>(
    type: Key,
    handler?: Handler<MittEvents[Key]>
  ): this {
    this._emitter.off(type, handler);
    return this;
  }
}

export default Eventhub;
