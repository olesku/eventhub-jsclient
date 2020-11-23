/// <reference types="node" />
import events from "events";
declare type SubscriptionCallback = (message: any) => void;
declare enum LifecycleEvents {
    CONNECT = "connect",
    RECONNECT = "reconnect",
    DISCONNECT = "disconnect",
    OFFLINE = "offline"
}
declare interface IEventhub {
    on(event: LifecycleEvents, listener: Function): this;
}
export default class Eventhub extends events.EventEmitter implements IEventhub {
    private _wsUrl;
    private _socket;
    private _opts;
    private _isConnected;
    private _rpcResponseCounter;
    private _rpcCallbackList;
    private _subscriptionCallbackList;
    private _sentPingsList;
    private _pingTimer;
    private _pingTimeOutTimer;
    /**
     * Constructor (new Eventhub).
     * @param url Eventhub websocket url.
     * @param token Authentication token.
     */
    constructor(url: string, token?: string, opts?: Object);
    /**
     * Connect to eventhub.
     * @returns Promise with true on success or error string on fail.
     */
    connect(): Promise<any>;
    private _reconnect;
    private _startPingMonitor;
    /**
     * Send a RPC request to the connected Eventhub.
     * @param method Which RPCMethod to call.
     * @param params What parameters to include with the call.
     * @return Promise with response or error.
     */
    private _sendRPCRequest;
    /**
     * Parse incoming websocket response and call correct handlers.
     * @param response Response string.
     */
    private _parseRPCResponse;
    /**
     * Check if we are already subscribed to a topic.
     * @param topic Topic.
     */
    isSubscribed(topic: string): boolean;
    /**
     * Subscribe to a topic pattern.
     * @param topic Topic to subscribe to.
     * @param callback Callback to call when we receive a message the subscribed topic.
     * @param opts Options to send with the request.
     * @returns Promise with success or callback.
     */
    subscribe(topic: string, callback: SubscriptionCallback, opts?: Object): Promise<any>;
    /**
     * Unsubscribe to one or more topic patterns.
     * @param topics Array of topics or single topic to unsubscribe from.
     */
    unsubscribe(topics: Array<string> | string): void;
    /**
    * Unsubscribe from all topics.
  
    */
    unsubscribeAll(): void;
    /**
     * Publish a message.
     * @param topic Topic to publish to.
     * @param message Message to publish.
     * @param opts Options to send with the request.
     */
    publish(topic: string, message: string, opts?: Object): Promise<any>;
    /**
     * List all current subscriptions.
     * @return Array containing current subscribed topics.
     */
    listSubscriptions(): Promise<any>;
}
export {};
