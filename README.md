# eventhub-jsclient

[![CI](https://github.com/olesku/eventhub-jsclient/actions/workflows/main.yml/badge.svg)](https://github.com/olesku/eventhub-jsclient/actions/workflows/main.yml)

eventhub-jsclient is a JavaScript client library for [Eventhub](https://github.com/olesku/eventhub).
It enables you to easily subscribe and publish to an Eventhub server from the browser, Node.js and Deno.

## Installation

```bash
$ npm i --save eventhub-jsclient
```

Or, if you're old-school:

```bash
$ wget -a scripts/eventhub-jsclient.js https://unpkg.com/eventhub-jsclient/dist/eventhub.umd.js
```

Or as a module directly from Unpkg:

```html
<script src="https://unpkg.com/eventhub-jsclient/dist/eventhub.umd.js"></script>
<!-- or -->
<script type="module">
  import Eventhub from 'https://unpkg.com/eventhub-jsclient/dist/eventhub.modern.js?module';
  const evClient = new Eventhub('ws://myeventhubserver.com', 'myAuthToken');
</script>
```

## Examples

Look in the [examples](https://github.com/olesku/eventhub-jsclient/tree/master/examples) directory for more examples.

**Subscribe to a topic**

```js
import Eventhub from 'eventhub-jsclient';
const evClient = new Eventhub('ws://myeventhubserver.com', 'myAuthToken');

await evClient.connect();
evClient.subscribe('my/topic', (msg) => {
  const { topic, id, message } = msg;
  console.log(`Topic: ${topic} Message ID: ${id} Message: ${message}`);

  // message is _always_ string, you need to parse it with JSON.parse if you sent JSON.
  const data = JSON.parse(message);
  console.log('Parsed data:', data);
});
```

**Subscribe to a topic and get all historical (cached) events since a given point in time**

```js
evClient.subscribe('my/topic', messageHandler, {
  since: 1572811274719, // Return all cached events since timestamp specified in milliseconds.
  limit: 100, // Limit the amount of returned historical events to 100.
});
```

You can also get all cached events since a given event id using the `sinceEventId: <eventid>` option instead of `since: <timestamp>`.

**Publish to a topic**

```js
import Eventhub from 'eventhub-jsclient';
const evClient = new Eventhub('ws://myeventhubserver.com', 'myAuthToken');

await evClient.connect();
await evClient.publish('my/topic', 'This is a test message!', {
  ttl: 3600, // TTL in seconds. This message expires from the cache after 1 hour.
  timestamp: Date.now(), // Timestamp to index message with. If not set receipt time will be used.
});
```

**Unsubscribe from a topic**

```js
eventhub.unsubscribe('my/topic');
```

**Unsubscribe from all subscribed topics**

```js
eventhub.unsubscribeAll();
```

**Close connection to client**

```js
await eventhub.disconnect();
```

**List all current subscribed topics**

```js
const subscriptions = await eventhub.listSubscriptions();
console.log('Subscriptions:', subscriptions);
```

**Get cached events for a topic without subscribing**

```js
// In this example we request all cached events from my/topic from the past 10 seconds.
// A negative 'since' number means Date.now() - abs(x).
// You can also speciy 'since' as a literal unix timestamp in milliseconds.
// We also support to request all events since a given message id by
// specifying 'sinceEventId': <id> instead of 'since'.
const cache = await evClient.getEventlog('my/topic', { since: -10000 });
for (const item of cache.items) {
  console.log(item);
}
```

## Reconnection handling

If the client loses connection with the server it will try to reconnect. When the connection is eventually restored all messages that has been lost during the disconnected period will be sent to the client before new ones.

Some of this behavior is configurable as the third parameter to the `connect()` method.

_Default options:_

```javascript
{
  pingInterval: 10000,      // Ping the server each 10 seconds.
  pingTimeout: 3000,        // Consider a ping as failed after 3 seconds.
  maxFailedPings: 3,        // How many lost pings before trying to reconnect.
  reconnectInterval: 10000, // 10 seconds between each reconnect attempt.
  disablePingCheck: false   // Disable pings and only rely on WebSocket 'onerror' event for detecting lost connection.
}
```

## Life-cycle events

Library provides life-cycle events. You can subscribe for these events with the below syntax

```javascript
evClient.on('connect', callback);
```

#### Event `'connect'`

Emitted on successful (re)connection.

#### Event `'reconnect'`

Emitted when a reconnect starts.

#### Event `'disconnect'`

Emitted after a connection is being close.

#### Event `'offline'`

Emitted when the client goes offline.

# License

eventhub-jsclient is licensed under MIT. See [LICENSE](https://github.com/olesku/eventhub-jsclient/blob/master/LICENSE).
