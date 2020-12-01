import { Server } from 'ws';
import Eventhub from '../src/eventhub';

let emitEventSpy,
    testServer,
    eventhub,
    wsResponseResolve,
    subscribeCallbackResolve,
    wsClient = undefined;

beforeEach(async () => {
    testServer = new Server({
        port: (Math.floor(Math.random() * (9000 - 8001 + 1)) + 8001)
    });

    testServer.on('connection', function (ws) {
        wsClient = ws;

        ws.on('message', (msg) => {
            if (wsResponseResolve != undefined) {
                wsResponseResolve(JSON.parse(msg.toString()));
                wsResponseResolve = undefined;
            }
        });
    });

    eventhub = new Eventhub(`ws://127.0.0.1:${testServer.options.port}`, "");

    await eventhub.connect();

    emitEventSpy = jest.spyOn(eventhub, 'emit');
});

afterEach(jest.clearAllMocks);

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

  expect(emitEventSpy).toHaveBeenCalledWith('connect');
});

test('Test that subscribe() sends correct RPC request to server', async () => {
  expect.assertions(1);

  expect(eventhub.subscribe("testTopic", function (msg) {
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

test('Test that disconnect() sends correct RPC request', async () => {
  expect.assertions(2);

  eventhub.disconnect();

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: "2.0",
    method: "disconnect",
    params: []
  });

  expect(emitEventSpy).toHaveBeenCalledWith('disconnect');
});

test('Test that isSubscribe is true for subscribed topic', () => {
  expect.assertions(1);

  eventhub.subscribe("testTopic", function (msg) {
    subscribeCallbackResolve(true);
  });

  expect(eventhub.isSubscribed("testTopic")).toEqual(true)
});

test('Expect subscribe callback to be called when we recieve a message', async () => {
  expect.assertions(1);

  eventhub.subscribe("testTopic", function (msg) {
      subscribeCallbackResolve(true);
  });

  wsClient.send('{"id":1,"jsonrpc":"2.0","result":{"id":"1573183666822-0","message":"Test message","topic":"testTopic"}}');

  const resp = await waitForSubscribeCallback();

  expect(resp).toBe(true);
});

test('Test that publish() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.publish("testTopic", "Test message");
  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: "2.0",
    method: "publish",
    params: {
      topic: "testTopic",
      message: "Test message"
    }
  });
});

test('Test that unsubscribe() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.subscribe("testTopic", function (msg) {
      subscribeCallbackResolve(true);
  });

  await waitForWSResponse();

  eventhub.unsubscribe("testTopic");

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 2,
    jsonrpc: "2.0",
    method: "unsubscribe",
    params: [
      "testTopic"
    ]
  });
});

test('Test that isSubscribe is false after unsubscribe', async () => {
  expect.assertions(1);

  eventhub.subscribe("testTopic", function (msg) {
    subscribeCallbackResolve(true);
  });

  await waitForWSResponse();

  eventhub.unsubscribe("testTopic");

  await waitForWSResponse();

  expect(eventhub.isSubscribed("testTopic")).toEqual(false);
});

test('Test that unsubscribeAll() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.subscribe("testTopic", function (msg) {
    subscribeCallbackResolve(true);
  });

  await waitForWSResponse();

  eventhub.unsubscribeAll();

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 2,
    jsonrpc: "2.0",
    method: "unsubscribeAll",
    params: []
  });
});

test("Test that unsubscribeAll unsubscribes all subscribed topics", () => {
  eventhub.subscribe("testTopic1", () => {});
  eventhub.subscribe("testTopic2", () => {});
  eventhub.subscribe("testTopic3", () => {});
  eventhub.subscribe("testTopic4", () => {});

  eventhub.unsubscribeAll();

  expect(eventhub.isSubscribed("testTopic1")).toEqual(false);
  expect(eventhub.isSubscribed("testTopic2")).toEqual(false);
  expect(eventhub.isSubscribed("testTopic3")).toEqual(false);
  expect(eventhub.isSubscribed("testTopic4")).toEqual(false);
});

test('Test that reconnect event is emitted', (done) => {
  expect.assertions(1);

  testServer.close();

  setTimeout(()=>{
    expect(emitEventSpy).toHaveBeenCalledWith('reconnect');

    done();
  }, 100)
});
