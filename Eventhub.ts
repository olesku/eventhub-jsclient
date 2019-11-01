import WebSocket from 'ws';

declare type RPCCallback = (err: string, message: string) => void;
declare type SubscriptionCallback = (message: string) => void;

enum RPCMethods {
  PUBLISH         = "publish",
  SUBSCRIBE       = 'subscribe',
  UNSUBSCRIBE     = 'unsubscribe',
  UNSUBSCRIBE_ALL = 'unsubscribeAll',
  LIST            = 'list',
  HISTORY         = 'history' // Not implemented yet.
}

class Subscription {
  topic: string
  rpcRequestId: number
  callback: SubscriptionCallback
}

export class Eventhub {
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
  constructor (url: string, token: string) {
    this._rpcResponseCounter = 0;
    this._rpcCallbackList = [];
    this._subscriptionCallbackList = [];
    this._wsUrl = `${url}/?auth=${token}`;
    this._socket = undefined;
  }

  /**
   * Connects to the eventhub.
   * @return Promise with true on success or error string on fail.
   */
  public connect() : Promise<any> {
    return new Promise(
      (resolve, reject) => {
        this._socket = new WebSocket(this._wsUrl);
        this._socket.on('message', this._parseRPCResponse.bind(this));

        this._socket.on('open', function() {
          resolve(true);
        });

        this._socket.on('error', function(err) {
          reject(err);
        })
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
  private _parseRPCResponse(response: string) : void {
    try {
      const responseObj : Object = JSON.parse(response);

      if(!responseObj.hasOwnProperty('id') || responseObj['id'] == 'null') {
        console.log("Got RPC Response without ID:", response);
        return;
      }

      // If this is a message publish then check if we are subscribed and call the corrrect callback.
      if (responseObj.hasOwnProperty('result') && responseObj['result'].hasOwnProperty('message') && responseObj['result'].hasOwnProperty('topic')) {
        for (let subscription of this._subscriptionCallbackList) {
          if (subscription.rpcRequestId == responseObj['id']) {
            subscription.callback(responseObj['result']);
            return;
          }
        }
      }

      // This is not a publish response.
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

      // If it's not a subscription response, remove the callback once we got a response.
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

  _/**
   * Subscribe to one or more topic patterns.
   * @param topics Array of topics or single topic to subscribe to.
   * @param callback Callback to call when we receive a message the subscribed topic(s).
   */
  public subscribe(topics: Array<string>|string, callback: SubscriptionCallback) : Promise<any> {
    let topicList: Array<string> = [];

    if (typeof(topics) == 'string') {
      topicList.push(topics);
    } else {
      topicList = topics;
    }

    if (topicList.length < 1) {
      // Todo: Return a error promise instead of throwing.
      throw Error("You must specify at least on topic to subscribe to.");
    }

    // First check if we are already subscribed to any of the given topics.
    for (const topic of topicList) {
      if (this.isSubscribed(topic)) {
        throw new Error(`Already subscribed to ${topic}`);
      }
    }

    // Do the actual subscription.
    for (const topic of topicList) {
      this._subscriptionCallbackList.push({
        topic: topic,
        rpcRequestId: (this._rpcResponseCounter+1),
        callback: callback
      });
    }

    return this._sendRPCRequest(RPCMethods.SUBSCRIBE, topicList);
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
  * @returns Number of unsuscribed topics.
  */
  public unsubscribeAll() : number {
    this._subscriptionCallbackList = [];
    this._sendRPCRequest(RPCMethods.UNSUBSCRIBE_ALL, []);
    return 0;
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

