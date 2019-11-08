# eventhub.js

eventhub.js is a JavaScript client library for [Eventhub](https://github.com/olesku/eventhub).
It enables you to easily subscribe and publish to any eventhub server from the browser or Node.js.

## Installation
```bash
$ npm i --save eventhub-client
```

## Building browser bundle
```bash
make
```

You can then find the built bundles in the ```dist``` directory.

## Examples

Look in the [examples](https://github.com/olesku/eventhub.js/tree/master/examples) directory for more examples.

**Subscribe to a topic**
```js
import Eventhub from 'eventhub-client';

let eventhub = new Eventhub("ws://myeventhubserver.com", "myAuthToken");

eventhub.connect().then(res => {
	eventhub.subscribe("my/topic", function (msg) {
		console.log(`Topic: ${msg.topic}: Message ID: ${msg.id} Message: ${msg.message}`);
	});
}).catch(err => {
	console.log(`Error connecting to Eventhub: ${err}`);
});
```

**Subscribe to a topic and get all history events since a given timestamp or messageid**
```js
import Eventhub from 'eventhub-client';

let eventhub = new Eventhub("ws://myeventhubserver.com", "myAuthToken");

eventhub.connect().then(res => {
	// Return all events since timestamp 1572811274719
	// before subscribing.
	// "0" will return all cached events available.
	const eventsSince = "1572811274719";

	eventhub.subscribe("my/topic", function (msg) {
		console.log(`Topic: ${msg.topic}: Message ID: ${msg.id} Message: ${msg.message}`);
	}, eventsSince);
}).catch(err => {
	console.log(`Error connecting to Eventhub: ${err}`);
});
```

**Publish to a topic**
```js
import Eventhub from 'eventhub-client';

let eventhub = new Eventhub("ws://myeventhubserver.com", "myAuthToken");

eventhub.connect().then(res => {
	eventhub.subscribe("my/topic");
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
