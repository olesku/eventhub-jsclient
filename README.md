# eventhub-jsclient
[![Build Status](https://travis-ci.com/olesku/eventhub-jsclient.svg?branch=master)](https://travis-ci.com/olesku/eventhub-jsclient)

eventhub-jsclient is a JavaScript client library for [Eventhub](https://github.com/olesku/eventhub).
It enables you to easily subscribe and publish to a eventhub server from the browser or Node.js.

## Installation
```bash
$ npm i --save eventhub-jsclient
```

## Examples

Look in the [examples](https://github.com/olesku/eventhub-jsclient/tree/master/examples) directory for more examples.

**Subscribe to a topic**
```js
const Eventhub = require('eventhub-jsclient');
const evClient = new Eventhub("ws://myeventhubserver.com", "myAuthToken");

evClient.connect().then(res => {
	evClient.subscribe("my/topic", function (msg) {
		console.log(`Topic: ${msg.topic}: Message ID: ${msg.id} Message: ${msg.message}`);
	});
}).catch(err => {
	console.log(`Error connecting to Eventhub: ${err}`);
});
```

**Subscribe to a topic and get all history events since a given timestamp or messageid**
```js
const Eventhub = require('eventhub-jsclient');
const evClient = new Eventhub("ws://myeventhubserver.com", "myAuthToken");

evClient.connect().then(res => {
	// Return all events since timestamp 1572811274719
	// before subscribing.
	// "0" will return all cached events available.
	const eventsSince = "1572811274719";

	evClient.subscribe("my/topic", function (msg) {
		console.log(`Topic: ${msg.topic}: Message ID: ${msg.id} Message: ${msg.message}`);
	}, eventsSince);
}).catch(err => {
	console.log(`Error connecting to Eventhub: ${err}`);
});
```

**Publish to a topic**
```js
const Eventhub = require('eventhub-jsclient');
const evClient = new Eventhub("ws://myeventhubserver.com", "myAuthToken");

evClient.connect().then(res => {
	evClient.publish("my/topic", "This is a test message!");
}).catch(err => {
	console.log(`Error connecting to Eventhub: ${err}`);
});
```

**Unsubscribe from a topic**
```js
eventhub.unsubscribe("my/topic");
```

**Unsubscribe from all subscribed topics**
```js
eventhub.unsubscribeAll();
```
**List all current subscribed topics**
```js
eventhub.listSubscriptions().then( subscroptions => {
	console.log("Subscriptions:", subscriptions);
});
```

## Reconnect on loss of connection
If the client loses connection to the server it will try to reconnect with the server. When the connection is eventually regained all messages that has been lost during the disconnected period will be sent to the client.

Some of this behaviour is configureable as the third parameter to the ```connect()``` method.

```
Defaults:

{
  pingInterval: 10000,      // Ping the server each 10 seconds.
  pingTimeout: 3000,        // Consider a ping as failed after 3 seconds.
  maxFailedPings: 3,        // How many lost pings before trying to reconnect.
  reconnectInterval: 10000, // 10 seconds between each reconnect attempt.
  disablePingCheck: false   // Disable pings and only rely on WebSocket 'onerror' event for detecting lost connection.
}
```

# License
eventhub-jsclient is licensed under MIT. See [LICENSE](https://github.com/olesku/eventhub-jsclient/blob/master/LICENSE).
