import WebSocket from 'ws';

export declare type SubscriptionCallback = (err: object, message: object) => void;

enum RPCMethods {
  PUBLISH        = "publish",
  SUBSCRIBE      = 'subscribe',
  UNSUBSCRIBE    = 'unsubscribe',
  UNSUBSCRIBEALL = 'unsubscribeAll',
  LIST           = 'list',
  HISTORY        = 'history',
  DISCONNECT     = 'disconnect',
}

export class Eventhub {
  private _wsUrl: string;
  private _socket: WebSocket;

  private _rpcResponseCounter: number;
  // [ RPC ID, callback ]
  private _rpcCallbackList: Array<[string, SubscriptionCallback]>;
  private _subscriptionList: Array<string>;

  constructor (url: string, token: string) {
    this._rpcCallbackList = [];
    this._rpcResponseCounter = 0;
    this._subscriptionList = [];
    this._wsUrl = `${url}/?auth=${token}`;
    this._socket = undefined;
  }

  /**
   * Connects to the eventhub.
   * @returns Promise with true on success or error string on fail.
   */
  public connect() : Promise<any> {
    return new Promise(
      (resolve, reject) => {
        this._socket = new WebSocket(this._wsUrl);
        this._socket.on('message', this.parseRPCResponse);

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
   */
  private _sendRPCRequest(method: RPCMethods, params: Array<string>) : number {
    this._rpcResponseCounter++;

    const requestObject = {
      id: this._rpcResponseCounter,
      jsonrpc: "2.0",
      method: method,
      params: params,
    }

    this._socket.send(JSON.stringify(requestObject));
    return this._rpcResponseCounter;
  }

  private parseRPCResponse(message: string, err: string ) : void {
    console.log("Message:", message, "Error:", err);
  }

  /**
   * Check if we are already subscribed to a topic.
   * @param topic Topic.
   */
  public isSubscribed(topic: string) {
    /*for (const subscribedTopic of this.subscriptionCallbacks) {
      if (subscribedTopic[0] === topic) return true;
    }*/

    return false;
  }

  _/**
   * Subscribe to one or more topic patterns.
   * @param topics Array of topics or single topic to subscribe to.
   * @param callback Callback to call when we receive a message the subscribed topic(s).
   */
  public subscribe(topics: Array<string>|string, callback: SubscriptionCallback) : void {
    let topicList: Array<string>

    if (typeof(topics) == 'string') {
      topicList.push(topics);
    } else {
      topicList = topics;
    }
    
    if (topicList.length < 1) {
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
      //this.subscriptionCallbacks.push([topic, callback]);
    }
    
    this._sendRPCRequest(RPCMethods.SUBSCRIBE, topicList);    
  }

  /**
   * Unsubscribe to one or more topic patterns.
   * @param topics Array of topics or single topic to unsubscribe from.
   */
  public unsubscribe(topics: Array<string>|string) : void {

  }

  /**
  * Unsubscribe from all topics.
  * @returns Number of unsuscribed topics. 
  */
  public unsubscribeAll() : number {

    return 0;
  }

  public publish(topic: string, message: string) {

  }

  public listSubscriptions() : Promise<Array<string>> {
    return new Promise((resolve, reject) => {
      
    });
  }
}

