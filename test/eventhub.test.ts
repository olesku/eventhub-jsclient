import { Server } from 'ws';
import Eventhub from '../src/eventhub';

const testServer = new Server({
  port: (Math.floor(Math.random() * (9000 - 8001 + 1)) + 8001)
});

const eventhub = new Eventhub(`ws://127.0.0.1:${testServer.options.port}`, "", {
  retryPublish: true
});

let wsResponseResolve, subscribeCallbackResolve, wsClient = undefined;

testServer.on('connection', function (ws) {
  wsClient = ws;

  ws.on('message', (msg) => {
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

  const resp = await waitForWSResponse();

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
  const resp = await waitForWSResponse();

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
  const resp = await waitForWSResponse();

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
  const resp = await waitForWSResponse();

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


test('Test that publish() during a disconnect retains messages', async () => {
  const testData = [
    { topic: 'testTopic1', message: 'Foo' },
    { topic: 'testTopic1', message: 'Bar' },
    { topic: 'testTopic1', message: 'Baz' },
    { topic: 'testTopic2', message: 'Hello' },
    { topic: 'testTopic3', message: 'World' },
    { topic: 'testTopic4', message: 'Sup' },
  ]

  const failingSrv = new Server({
    port: (Math.floor(Math.random() * (9000 - 8001 + 1)) + 8001)
  });

  const ev = new Eventhub(`ws://127.0.0.1:${failingSrv.options.port}`, "", {
    retryPublish: true,
    reconnectInterval: 100,
    pingTimeout: 200,
    maxFailedPings: 2,
    pingInterval: 200
  });

  await ev.connect().catch(err => {
    fail(err);
  });

  for (let t of testData) {
    if (!ev.isSubscribed(t.topic)) {
      ev.subscribe(t.topic, () => {});
    }
  }

  failingSrv.close();
  await new Promise((r) => setTimeout(r, 1000));

  for (let pub of testData) {
    ev.publish(pub.topic, pub.message);
  }

  const newSrv = new Server({
    port: failingSrv.options.port
  });

  var pRes : any;
  const p = new Promise(res => {
    pRes = res;
  });

  newSrv.on('connection', function (ws) {
    let recvPublishes : Array<string> = [];

    ws.on('message', (msg) => {
      let obj = JSON.parse(msg.toString());
      if (obj['method'] == "publish") {
        recvPublishes.push(obj['params']);
      }

      if (recvPublishes.length == testData.length) {
        expect(recvPublishes).toEqual(testData);
        pRes();
      }
    });
  });

  await p;
  newSrv.close();
});