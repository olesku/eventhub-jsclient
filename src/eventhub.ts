
/*
The MIT License (MIT)
Copyright (c) 2019 Ole Fredrik Skudsvik <ole.skudsvik@gmail.com>
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

declare type RPCCallback = (err: string, message: string) => void;
declare type SubscriptionCallback = (message: any) => void;

enum RPCMethods {
  PUBLISH         = "publish",
  SUBSCRIBE       = 'subscribe',
  UNSUBSCRIBE     = 'unsubscribe',
  UNSUBSCRIBE_ALL = 'unsubscribeAll',
  LIST            = 'list',
  HISTORY         = 'history', // Not implemented yet.
  DISCONNECT      = 'disconnect'
}

class Subscription {
  topic: string
  rpcRequestId: number
  callback: SubscriptionCallback
}

export default class Eventhub {
  private _wsUrl: string;
  private _socket: WebSocket;
  private _rpcResponseCounter: number;
  private _rpcCallbackList: Array<[number, RPCCallback]>;
  private _subscriptionCallbackList: Array<Subscription>;

  /**
   * Constructor (new Eventhub).
   * @param url Eventhub websocket url.
   * @param token Authentication token.
   */
  constructor (url: string, token?: string) {
    this._rpcResponseCounter = 0;
    this._rpcCallbackList = [];
    this._subscriptionCallbackList = [];
    this._wsUrl = `${url}/?auth=${token}`;
    this._socket = undefined;
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
          resolve(true);
        };

        this._socket.onerror = function(err) {
          reject(err);
        };
    });
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
      this._rpcCallbackList.push([this._rpcResponseCounter, function (err: string, resp: string) {
        if (err != null) {
          reject(err);
        } else {
          resolve(resp);
        }
      }.bind(this)]);

      this._socket.send(JSON.stringify(requestObject));
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
   * @returns Promise with success or callback.
   */
  public subscribe(topic: string, callback: SubscriptionCallback, sinceEvent?: string) : Promise<any> {
    let subscribeRequest : Object = {
      "topic": topic
    };

    if (topic == "") {
      return new Promise((_, reject) => {
        reject(new Error("Topic cannot be empty."))
      });
    }

    if (typeof(sinceEvent) == 'string' && sinceEvent != "") {
      let sinceEventValidator = new RegExp('^[0-9]+([-]{1}[0-9]+)?$');
      if (!sinceEventValidator.exec(sinceEvent)) {
        return new Promise((_, reject) => {
          reject(new Error(`${sinceEvent} is a invalid message id.`));
        });
      }

      subscribeRequest['sinceEvent'] = sinceEvent;
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
   */
  public publish(topic: string, message: string) : Promise<any> {
    const publishRequest = {
      topic: topic,
      message: message
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