/*
The MIT License (MIT)
Copyright (c) 2020 Ole Fredrik Skudsvik <ole.skudsvik@gmail.com>
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

import WebSocket from 'isomorphic-ws';
import EventEmitter from 'events';

declare type RPCCallback = (err: string, message: string) => void;
declare type SubscriptionCallback = (message: any) => void;

enum RPCMethods {
  PUBLISH         = "publish",
  SUBSCRIBE       = 'subscribe',
  UNSUBSCRIBE     = 'unsubscribe',
  UNSUBSCRIBE_ALL = 'unsubscribeAll',
  LIST            = 'list',
  HISTORY         = 'history',
  PING            = 'ping',
  DISCONNECT      = 'disconnect'
}

enum LifecycleEvents {
  CONNECT         = 'connect',
  RECONNECT       = 'reconnect',
  DISCONNECT      = 'disconnect',
  OFFLINE         = 'offline',
}

class Subscription {
  topic: string
  rpcRequestId: number
  callback: SubscriptionCallback
  lastRecvMessageId?: string
}

class PingRequest {
  timestamp: Object
  rpcRequestId: number
}

class ConnectionOptions {
  pingInterval:   number    = 10000;
  pingTimeout:    number    = 3000;
  maxFailedPings: number    = 3;
  reconnectInterval: number = 10000;
  disablePingCheck: boolean = false;
}

declare interface IEventhub {
  on(event: LifecycleEvents, listener: Function): this;
}

export default class Eventhub extends EventEmitter implements IEventhub {
  private _wsUrl: string;
  private _socket: WebSocket;
  private _opts: ConnectionOptions;
  private _isConnected: boolean;

  private _rpcResponseCounter: number;
  private _rpcCallbackList: Array<[number, RPCCallback]>;
  private _subscriptionCallbackList: Array<Subscription>;

  private _sentPingsList: Array<PingRequest>;
  private _pingTimer : any;
  private _pingTimeOutTimer : any;

  /**
   * Constructor (new Eventhub).
   * @param url Eventhub websocket url.
   * @param token Authentication token.
   */
  constructor (url: string, token?: string, opts?: Object) {
    super();

    this._rpcResponseCounter = 0;
    this._rpcCallbackList = [];
    this._subscriptionCallbackList = [];
    this._sentPingsList = [];
    this._wsUrl = `${url}/?auth=${token}`;
    this._socket = undefined;
    this._isConnected = false;
    this._opts = new ConnectionOptions();

    Object.assign(this._opts, opts);
  }

  /**
   * Connect to eventhub.
   * @returns Promise with true on success or error string on fail.
   */
  public connect() : Promise<any> {
    return new Promise(
      (resolve, reject) => {
        this._socket = new WebSocket(this._wsUrl);
        this._socket.onmessage = this._parseRPCResponse.bind(this);

        this._socket.onopen = function() {
          this._isConnected = true;

          if (!this._opts.disablePingCheck) {
            this._startPingMonitor();
          }

          this.emit(LifecycleEvents.CONNECT);

          resolve(true);
        }.bind(this);

        this._socket.onerror = function(err) {
          if (this._isConnected) {
            console.log("Eventhub WebSocket connection error:", err);
            this._isConnected = false;

            this.emit(LifecycleEvents.DISCONNECT, err);

            this._reconnect();
          } else {
            this.emit(LifecycleEvents.OFFLINE, err);

            reject(err);
          }
        }.bind(this);

        this._socket.onclose = function(err) {
          if (this._isConnected) {
            this._isConnected = false;
            this._reconnect();
          }

          this.emit(LifecycleEvents.OFFLINE, err);
        }.bind(this);
    });
  }

  /*
   * Try to reconnect in a loop until we succeed.
  */
  private _reconnect() : void {
    if (this._isConnected) return;

    this.emit(LifecycleEvents.RECONNECT)

    const reconnectInterval = this._opts.reconnectInterval;

    if (this._socket.readyState != WebSocket.CLOSED &&
        this._socket.readyState != WebSocket.CLOSING) {
      this._socket.close();
    }

    if (!this._opts.disablePingCheck) {
      clearInterval(this._pingTimer);
      clearInterval(this._pingTimeOutTimer);
      this._sentPingsList = [];
    }

    this.connect().then(res => {
      let subscriptions = this._subscriptionCallbackList.slice();
      this._rpcResponseCounter = 0;
      this._rpcCallbackList = [];
      this._subscriptionCallbackList = [];

      for (let sub of subscriptions) {
        this.subscribe(sub.topic, sub.callback, { sinceEventId: sub.lastRecvMessageId });
      }
    }).catch(err => {
      setTimeout(this._reconnect.bind(this), reconnectInterval);
    });
  }

  /*
  * Send pings to the server on the configured interval.
  * Mark the client as disconnected if <_opts.maxFailedPings> pings fail.
  * Also trigger the reconnect procedure.
  */
  private _startPingMonitor()  : void {
    const pingInterval = this._opts.pingInterval;
    const maxFailedPings = this._opts.maxFailedPings;

    // Ping server each <pingInterval> second.
    this._pingTimer = setInterval(function() {
      if (!this._isConnected) {
        return;
      }

      const pingReq : PingRequest = {
        timestamp: Date.now(),
        rpcRequestId: this._rpcResponseCounter + 1
      };

      this._sentPingsList.push(pingReq);
      this._sendRPCRequest(RPCMethods.PING, []).then(pong => {
        for (let i = 0; i < this._sentPingsList.length; i++) {
          if (this._sentPingsList[i].rpcRequestId == pingReq.rpcRequestId) {
            this._sentPingsList.splice(i, 1);
          }
        }
      });
    }.bind(this), pingInterval);

    // Check that our pings is successfully ponged by the server.
    // disconnect and reconnect if maxFailedPings is reached.
    this._pingTimeOutTimer = setInterval(function() {
      const now = Date.now();
      let failedPingCount = 0;
      for (let i = 0; i < this._sentPingsList.length; i++) {
        if (now > (this._sentPingsList[i].timestamp + this._opts.pingTimeout)) {
          failedPingCount++;
        }
      }

      if (failedPingCount >= maxFailedPings) {
        this._isConnected = false;
        this._reconnect();
      }
    }.bind(this), pingInterval);
  }

  /**
   * Send a RPC request to the connected Eventhub.
   * @param method Which RPCMethod to call.
   * @param params What parameters to include with the call.
   * @return Promise with response or error.
   */
  private _sendRPCRequest(method: RPCMethods, params: any) : Promise<any> {
    this._rpcResponseCounter++;

    const requestObject = {
      id: this._rpcResponseCounter,
      jsonrpc: "2.0",
      method: method,
      params: params,
    }

    return new Promise((resolve, reject) => {
      if (this._socket.readyState != WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected."));
        return;
      }

      this._rpcCallbackList.push([this._rpcResponseCounter, function (err: string, resp: string) {
        if (err != null) {
          reject(err);
        } else {
          resolve(resp);
        }
      }.bind(this)]);

      try {
        this._socket.send(JSON.stringify(requestObject));
      } catch(err) {
        reject(err);
      }
    });
  }

  /**
   * Parse incoming websocket response and call correct handlers.
   * @param response Response string.
   */
  private _parseRPCResponse(response: Object) : void {
    try {
      const responseObj : Object = JSON.parse(response['data']);

      if(!responseObj.hasOwnProperty('id') || responseObj['id'] == 'null') {
        return;
      }

      // If this is a message event then check if we are
      // subscribed and call the corrrect callback.
      if (responseObj.hasOwnProperty('result') && responseObj['result'].hasOwnProperty('message') && responseObj['result'].hasOwnProperty('topic')) {
        for (let subscription of this._subscriptionCallbackList) {
          if (subscription.rpcRequestId == responseObj['id']) {
            subscription.lastRecvMessageId = responseObj['result']['id'];
            subscription.callback(responseObj['result']);
            return;
          }
        }
      }

      // This is not a message event, see if we have a callback for it.
      let rpcCallback = undefined;
      for (let callback of  this._rpcCallbackList) {
        if (callback[0] == responseObj['id']) {
          rpcCallback = callback[1];
          break;
        }
      }

      // We have no callback for the response, do nothing.
      if (rpcCallback === undefined) {
        return;
      }

      // We have a callback for the response, call it.
      if (responseObj.hasOwnProperty('error')) {
        rpcCallback(responseObj['error'], null);
      } else if (responseObj.hasOwnProperty('result')) {
        rpcCallback(null, responseObj['result']);
      }

      // Remove the callback once it has been called.
      for (let i = 0; i < this._rpcCallbackList.length; i++) {
        if (this._rpcCallbackList[i][0] == responseObj['id']) {
          this._rpcCallbackList.splice(i, 1);
        }
      }
    } catch (err) {
      console.log("Failed to parse websocket response:", err);
      return;
    }
  }

  /**
   * Check if we are already subscribed to a topic.
   * @param topic Topic.
   */
  public isSubscribed(topic: string) {
    for (const subscribedTopic of this._subscriptionCallbackList) {
      if (subscribedTopic.topic == topic) return true;
    }
    return false;
  }

  /**
   * Subscribe to a topic pattern.
   * @param topic Topic to subscribe to.
   * @param callback Callback to call when we receive a message the subscribed topic.
   * @param opts Options to send with the request.
   * @returns Promise with success or callback.
   */
  public subscribe(topic: string, callback: SubscriptionCallback, opts?: Object) : Promise<any> {
    let subscribeRequest : Object = {
      "topic": topic
    };

    if (topic == "") {
      return new Promise((_, reject) => {
        reject(new Error("Topic cannot be empty."))
      });
    }

    if (typeof(opts) !== 'undefined') {
      subscribeRequest = Object.assign(subscribeRequest, opts);
    }

    // First check if we are already subscribed to the topic.
    if (this.isSubscribed(topic)) {
      return new Promise((_, reject) => {
        reject(new Error(`Already subscribed to ${topic}`));
      });
    }

    this._subscriptionCallbackList.push({
      topic: topic,
      rpcRequestId: (this._rpcResponseCounter+1),
      callback: callback
    });

    return this._sendRPCRequest(RPCMethods.SUBSCRIBE, subscribeRequest);
  }

  /**
   * Unsubscribe to one or more topic patterns.
   * @param topics Array of topics or single topic to unsubscribe from.
   */
  public unsubscribe(topics: Array<string>|string) : void {
    let topicList: Array<string> = [];

    if (typeof(topics) == 'string') {
      topicList.push(topics);
    } else {
      topicList = topics;
    }

    if (topicList.length > 0) {
      for (let topic of topicList) {
        for (let i = 0; i < this._subscriptionCallbackList.length; i++) {
          if (topic == this._subscriptionCallbackList[i].topic) {
            this._subscriptionCallbackList.splice(i, 1);
          }
        }
      }

      this._sendRPCRequest(RPCMethods.UNSUBSCRIBE, topicList);
    }
  }

  /**
  * Unsubscribe from all topics.

  */
  public unsubscribeAll() : void {
    this._subscriptionCallbackList = [];
    this._sendRPCRequest(RPCMethods.UNSUBSCRIBE_ALL, []);
  }

  /**
   * Publish a message.
   * @param topic Topic to publish to.
   * @param message Message to publish.
   * @param opts Options to send with the request.
   */
  public publish(topic: string, message: string, opts?: Object) : Promise<any> {
    let publishRequest = {
      topic: topic,
      message: message
    }

    if (typeof(opts) !== 'undefined') {
      publishRequest = Object.assign(publishRequest, opts);
    }

    return this._sendRPCRequest(RPCMethods.PUBLISH, publishRequest);
  }

  /**
   * List all current subscriptions.
   * @return Array containing current subscribed topics.
   */
  public listSubscriptions() : Promise<any> {
    return this._sendRPCRequest(RPCMethods.LIST, []);
  }
}
