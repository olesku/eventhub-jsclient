import { Server } from 'ws';
import Eventhub from '../src/eventhub';

const testServer = new Server({
  port: (Math.floor(Math.random() * (9000 - 8001 + 1)) + 8001)
});

const eventhub = new Eventhub(`ws://127.0.0.1:${testServer.options.port}`, "");

var wsResponseResolve, subscribeCallbackResolve, wsClient = undefined;

testServer.on('connection', function (ws) {
  wsClient = ws;

  ws.on('message', function (msg) {
    if (wsResponseResolve != undefined) {
      wsResponseResolve(JSON.parse(msg.toString()));
      wsResponseResolve = undefined;
    }
  });
});

afterAll(() => {
  testServer.close();
});

// Wait for a websocket response.
function waitForWSResponse() : Promise<any> {
  return new Promise<any>((resolve, reject) => {
    wsResponseResolve = resolve;
  });
}

// Wait for subscription callback to be called.
function waitForSubscribeCallback() : Promise<any> {
  return new Promise<any>((resolve, reject) => {
    subscribeCallbackResolve = resolve;
  });
}

test('That we can connect', async () => {
  await eventhub.connect().catch(err => {
    fail(err);
  });
});

test('Test that subscribe() sends correct RPC request to server', async () => {
 expect(eventhub.subscribe("testTopic", function(msg) {
    subscribeCallbackResolve(true);
  })).resolves.toBeCalled();

  let resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: "2.0",
    method: "subscribe",
    params: {
      topic: "testTopic"
    }
  });

});

test('Test that isSubscribe is true for subscribed topic', () => {
  expect(eventhub.isSubscribed("testTopic")).toEqual(true)
});

test('Expect subscribe callback to be called when we recieve a message', async () => {
  wsClient.send('{"id":1,"jsonrpc":"2.0","result":{"id":"1573183666822-0","message":"Test message","topic":"testTopic"}}');
  const resp = await waitForSubscribeCallback();

  expect(resp).toBe(true);
});

test('Test that publish() sends correct RPC request', async () => {
  eventhub.publish("testTopic", "Test message");
  let resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 2,
    jsonrpc: "2.0",
    method: "publish",
    params: {
      topic: "testTopic",
      message: "Test message"
    }
  });
});

test('Test that unsubscribe() sends correct RPC request', async () => {
  eventhub.unsubscribe("testTopic");
  let resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 3,
    jsonrpc: "2.0",
    method: "unsubscribe",
    params: [
      "testTopic"
    ]
  });
});

test('Test that isSubscribe is false after unsubscribe', () => {
  expect(eventhub.isSubscribed("testTopic")).toEqual(false);
});

test('Test that unsubscribeAll() sends correct RPC request', async () => {
  eventhub.unsubscribeAll();
  let resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 4,
    jsonrpc: "2.0",
    method: "unsubscribeAll",
    params: []
  });
});

test("Test that unsubscribeAll unsubscribes all subscribed topics", () => {
  expect(eventhub.subscribe("testTopic1", function(msg) {}));
  expect(eventhub.subscribe("testTopic2", function(msg) {}));
  expect(eventhub.subscribe("testTopic3", function(msg) {}));
  expect(eventhub.subscribe("testTopic4", function(msg) {}));

  eventhub.unsubscribeAll();

  expect(eventhub.isSubscribed("testTopic1")).toEqual(false);
  expect(eventhub.isSubscribed("testTopic2")).toEqual(false);
  expect(eventhub.isSubscribed("testTopic3")).toEqual(false);
  expect(eventhub.isSubscribed("testTopic4")).toEqual(false);
});
