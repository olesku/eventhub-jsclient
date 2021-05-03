function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var WebSocket = _interopDefault(require('isomorphic-ws'));
var EventEmitter = _interopDefault(require('events'));

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
var RPCMethods;

(function (RPCMethods) {
  RPCMethods["PUBLISH"] = "publish";
  RPCMethods["SUBSCRIBE"] = "subscribe";
  RPCMethods["UNSUBSCRIBE"] = "unsubscribe";
  RPCMethods["UNSUBSCRIBE_ALL"] = "unsubscribeAll";
  RPCMethods["LIST"] = "list";
  RPCMethods["HISTORY"] = "history";
  RPCMethods["PING"] = "ping";
  RPCMethods["DISCONNECT"] = "disconnect";
})(RPCMethods || (RPCMethods = {}));

var LifecycleEvents;

(function (LifecycleEvents) {
  LifecycleEvents["CONNECT"] = "connect";
  LifecycleEvents["RECONNECT"] = "reconnect";
  LifecycleEvents["DISCONNECT"] = "disconnect";
  LifecycleEvents["OFFLINE"] = "offline";
})(LifecycleEvents || (LifecycleEvents = {}));

var ConnectionOptions = function ConnectionOptions() {
  this.pingInterval = 10000;
  this.pingTimeout = 3000;
  this.maxFailedPings = 3;
  this.reconnectInterval = 10000;
  this.disablePingCheck = false;
};

var Eventhub = /*@__PURE__*/(function (EventEmitter$$1) {
  function Eventhub(url, token, opts) {
    EventEmitter$$1.call(this);
    this._rpcResponseCounter = 0;
    this._rpcCallbackList = [];
    this._subscriptionCallbackList = [];
    this._sentPingsList = [];
    this._wsUrl = url + "/?auth=" + token;
    this._socket = undefined;
    this._isConnected = false;
    this._opts = new ConnectionOptions();
    Object.assign(this._opts, opts);
  }

  if ( EventEmitter$$1 ) Eventhub.__proto__ = EventEmitter$$1;
  Eventhub.prototype = Object.create( EventEmitter$$1 && EventEmitter$$1.prototype );
  Eventhub.prototype.constructor = Eventhub;
  /**
   * Connect to eventhub.
   * @returns Promise with true on success or error string on fail.
   */


  Eventhub.prototype.connect = function connect () {
    var this$1 = this;

    return new Promise(function (resolve, reject) {
      this$1._socket = new WebSocket(this$1._wsUrl);
      this$1._socket.onmessage = this$1._parseRPCResponse.bind(this$1);

      this$1._socket.onopen = function () {
        this.emit(LifecycleEvents.CONNECT);
        this._isConnected = true;

        if (!this._opts.disablePingCheck) {
          this._startPingMonitor();
        }

        resolve(true);
      }.bind(this$1);

      this$1._socket.onerror = function (err) {
        this.emit(LifecycleEvents.OFFLINE, err);

        if (this._isConnected) {
          console.log("Eventhub WebSocket connection error:", err);
          this._isConnected = false;

          this._reconnect();
        } else {
          reject(err);
        }
      }.bind(this$1);

      this$1._socket.onclose = function (err) {
        if (this._isConnected) {
          this.emit(LifecycleEvents.OFFLINE, err);
          this._isConnected = false;

          this._reconnect();
        }
      }.bind(this$1);
    });
  };
  /*
   * Try to reconnect in a loop until we succeed.
  */


  Eventhub.prototype._reconnect = function _reconnect () {
    var this$1 = this;

    if (this._isConnected) { return; }
    this.emit(LifecycleEvents.RECONNECT);
    var reconnectInterval = this._opts.reconnectInterval;

    if (this._socket.readyState != WebSocket.CLOSED && this._socket.readyState != WebSocket.CLOSING) {
      this._socket.close();
    }

    if (!this._opts.disablePingCheck) {
      clearInterval(this._pingTimer);
      clearInterval(this._pingTimeOutTimer);
      this._sentPingsList = [];
    }

    this.connect().then(function (res) {
      var subscriptions = this$1._subscriptionCallbackList.slice();

      this$1._rpcResponseCounter = 0;
      this$1._rpcCallbackList = [];
      this$1._subscriptionCallbackList = [];

      for (var i = 0, list = subscriptions; i < list.length; i += 1) {
        var sub = list[i];

        this$1.subscribe(sub.topic, sub.callback, {
          sinceEventId: sub.lastRecvMessageId
        });
      }
    }).catch(function (err) {
      setTimeout(this$1._reconnect.bind(this$1), reconnectInterval);
    });
  };
  /*
  * Send pings to the server on the configured interval.
  * Mark the client as disconnected if <_opts.maxFailedPings> pings fail.
  * Also trigger the reconnect procedure.
  */


  Eventhub.prototype._startPingMonitor = function _startPingMonitor () {
    var pingInterval = this._opts.pingInterval;
    var maxFailedPings = this._opts.maxFailedPings; // Ping server each <pingInterval> second.

    this._pingTimer = setInterval(function () {
      var this$1 = this;

      if (!this._isConnected) {
        return;
      }

      var pingReq = {
        timestamp: Date.now(),
        rpcRequestId: this._rpcResponseCounter + 1
      };

      this._sentPingsList.push(pingReq);

      this._sendRPCRequest(RPCMethods.PING, []).then(function (pong) {
        for (var i = 0; i < this$1._sentPingsList.length; i++) {
          if (this$1._sentPingsList[i].rpcRequestId == pingReq.rpcRequestId) {
            this$1._sentPingsList.splice(i, 1);
          }
        }
      });
    }.bind(this), pingInterval); // Check that our pings is successfully ponged by the server.
    // disconnect and reconnect if maxFailedPings is reached.

    this._pingTimeOutTimer = setInterval(function () {
      var now = Date.now();
      var failedPingCount = 0;

      for (var i = 0; i < this._sentPingsList.length; i++) {
        if (now > this._sentPingsList[i].timestamp + this._opts.pingTimeout) {
          failedPingCount++;
        }
      }

      if (failedPingCount >= maxFailedPings) {
        this._isConnected = false;

        this._reconnect();
      }
    }.bind(this), pingInterval);
  };
  /**
   * Send a RPC request to the connected Eventhub.
   * @param method Which RPCMethod to call.
   * @param params What parameters to include with the call.
   * @return Promise with response or error.
   */


  Eventhub.prototype._sendRPCRequest = function _sendRPCRequest (method, params) {
    var this$1 = this;

    this._rpcResponseCounter++;
    var requestObject = {
      id: this._rpcResponseCounter,
      jsonrpc: "2.0",
      method: method,
      params: params
    };
    return new Promise(function (resolve, reject) {
      if (this$1._socket.readyState != WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected."));
        return;
      }

      this$1._rpcCallbackList.push([this$1._rpcResponseCounter, function (err, resp) {
        if (err != null) {
          reject(err);
        } else {
          resolve(resp);
        }
      }.bind(this$1)]);

      try {
        this$1._socket.send(JSON.stringify(requestObject));
      } catch (err) {
        reject(err);
      }
    });
  };
  /**
   * Parse incoming websocket response and call correct handlers.
   * @param response Response string.
   */


  Eventhub.prototype._parseRPCResponse = function _parseRPCResponse (response) {
    try {
      var responseObj = JSON.parse(response['data']);

      if (!responseObj.hasOwnProperty('id') || responseObj['id'] == 'null') {
        return;
      } // If this is a message event then check if we are
      // subscribed and call the corrrect callback.


      if (responseObj.hasOwnProperty('result') && responseObj['result'].hasOwnProperty('message') && responseObj['result'].hasOwnProperty('topic')) {
        for (var i$1 = 0, list = this._subscriptionCallbackList; i$1 < list.length; i$1 += 1) {
          var subscription = list[i$1];

          if (subscription.rpcRequestId == responseObj['id']) {
            subscription.lastRecvMessageId = responseObj['result']['id'];
            subscription.callback(responseObj['result']);
            return;
          }
        }
      } // This is not a message event, see if we have a callback for it.


      var rpcCallback = undefined;

      for (var i$2 = 0, list$1 = this._rpcCallbackList; i$2 < list$1.length; i$2 += 1) {
        var callback = list$1[i$2];

        if (callback[0] == responseObj['id']) {
          rpcCallback = callback[1];
          break;
        }
      } // We have no callback for the response, do nothing.


      if (rpcCallback === undefined) {
        return;
      } // We have a callback for the response, call it.


      if (responseObj.hasOwnProperty('error')) {
        rpcCallback(responseObj['error'], null);
      } else if (responseObj.hasOwnProperty('result')) {
        rpcCallback(null, responseObj['result']);
      } // Remove the callback once it has been called.


      for (var i = 0; i < this._rpcCallbackList.length; i++) {
        if (this._rpcCallbackList[i][0] == responseObj['id']) {
          this._rpcCallbackList.splice(i, 1);
        }
      }
    } catch (err) {
      console.log("Failed to parse websocket response:", err);
      return;
    }
  };
  /**
   * Check if we are already subscribed to a topic.
   * @param topic Topic.
   */


  Eventhub.prototype.isSubscribed = function isSubscribed (topic) {
    for (var i = 0, list = this._subscriptionCallbackList; i < list.length; i += 1) {
      var subscribedTopic = list[i];

      if (subscribedTopic.topic == topic) { return true; }
    }

    return false;
  };
  /**
   * Subscribe to a topic pattern.
   * @param topic Topic to subscribe to.
   * @param callback Callback to call when we receive a message the subscribed topic.
   * @param opts Options to send with the request.
   * @returns Promise with success or callback.
   */


  Eventhub.prototype.subscribe = function subscribe (topic, callback, opts) {
    var subscribeRequest = {
      "topic": topic
    };

    if (topic == "") {
      return new Promise(function (_, reject) {
        reject(new Error("Topic cannot be empty."));
      });
    }

    if (typeof opts !== 'undefined') {
      subscribeRequest = Object.assign(subscribeRequest, opts);
    } // First check if we are already subscribed to the topic.


    if (this.isSubscribed(topic)) {
      return new Promise(function (_, reject) {
        reject(new Error(("Already subscribed to " + topic)));
      });
    }

    this._subscriptionCallbackList.push({
      topic: topic,
      rpcRequestId: this._rpcResponseCounter + 1,
      callback: callback
    });

    return this._sendRPCRequest(RPCMethods.SUBSCRIBE, subscribeRequest);
  };
  /**
   * Unsubscribe to one or more topic patterns.
   * @param topics Array of topics or single topic to unsubscribe from.
   */


  Eventhub.prototype.unsubscribe = function unsubscribe (topics) {
    var topicList = [];

    if (typeof topics == 'string') {
      topicList.push(topics);
    } else {
      topicList = topics;
    }

    if (topicList.length > 0) {
      for (var i$1 = 0, list = topicList; i$1 < list.length; i$1 += 1) {
        var topic = list[i$1];

        for (var i = 0; i < this._subscriptionCallbackList.length; i++) {
          if (topic == this._subscriptionCallbackList[i].topic) {
            this._subscriptionCallbackList.splice(i, 1);
          }
        }
      }

      this._sendRPCRequest(RPCMethods.UNSUBSCRIBE, topicList);
    }
  };
  /**
  * Unsubscribe from all topics.
     */


  Eventhub.prototype.unsubscribeAll = function unsubscribeAll () {
    this._subscriptionCallbackList = [];

    this._sendRPCRequest(RPCMethods.UNSUBSCRIBE_ALL, []);
  };
  /**
   * Publish a message.
   * @param topic Topic to publish to.
   * @param message Message to publish.
   * @param opts Options to send with the request.
   */


  Eventhub.prototype.publish = function publish (topic, message, opts) {
    var publishRequest = {
      topic: topic,
      message: message
    };

    if (typeof opts !== 'undefined') {
      publishRequest = Object.assign(publishRequest, opts);
    }

    return this._sendRPCRequest(RPCMethods.PUBLISH, publishRequest);
  };
  /**
   * List all current subscriptions.
   * @return Array containing current subscribed topics.
   */


  Eventhub.prototype.listSubscriptions = function listSubscriptions () {
    return this._sendRPCRequest(RPCMethods.LIST, []);
  };
  /**
   * Close connection to Eventhub
   */


  Eventhub.prototype.disconnect = function disconnect () {
    this._isConnected = false;

    var response = this._sendRPCRequest(RPCMethods.DISCONNECT, []);

    this.emit(LifecycleEvents.DISCONNECT);
    return response;
  };

  return Eventhub;
}(EventEmitter));

module.exports = Eventhub;
//# sourceMappingURL=eventhub.js.map
