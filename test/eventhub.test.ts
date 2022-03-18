import { Server } from 'ws';
import Eventhub from '../src/eventhub';

const closeServer = (server: Server, cb: (err?: Error) => void) => {
  // @ts-ignore
  if (server._state === 0 /* RUNNING */) {
    // @ts-ignore
    testServer._server.unref();
    testServer.close(cb);
    testServer.emit('close');
  } else {
    cb();
  }
};

let emitEventSpy: jest.SpyInstance,
  testServer: Server,
  eventhub: Eventhub,
  wsResponseResolve: Function,
  subscribeCallbackResolve: Function,
  wsClient = undefined;

beforeEach(async () => {
  await new Promise((resolve: Function) => {
    testServer = new Server(
      {
        port: Math.floor(Math.random() * (9000 - 8001 + 1)) + 8001,
      },
      () => resolve()
    );
  });

  testServer.on('connection', function (ws) {
    wsClient = ws;

    testServer.on('close', () => {
      ws.close();
    });

    ws.on('message', (msg) => {
      if (wsResponseResolve != undefined) {
        wsResponseResolve(JSON.parse(msg.toString()));
        wsResponseResolve = undefined;
      }
    });
  });

  eventhub = new Eventhub(`ws://127.0.0.1:${testServer.options.port}`, '');

  await eventhub.connect();

  // @ts-ignore
  emitEventSpy = jest.spyOn(eventhub._emitter, 'emit');
});

afterEach(jest.clearAllMocks);

afterEach((done) => {
  closeServer(testServer, done);
});

// Wait for a websocket response.
function waitForWSResponse(): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    wsResponseResolve = resolve;
  });
}

// Wait for subscription callback to be called.
function waitForSubscribeCallback(): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    subscribeCallbackResolve = resolve;
  });
}

test('That we can connect', async () => {
  expect.assertions(1);

  await eventhub.connect().catch((err) => {
    fail(err);
  });

  expect(emitEventSpy).toHaveBeenCalledWith('connect');
});

test('Test that subscribe() sends correct RPC request to server', async () => {
  expect.assertions(1);

  expect(
    eventhub.subscribe('testTopic', function (msg) {
      subscribeCallbackResolve(true);
    })
  ).resolves.toBeCalled();

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'subscribe',
    params: {
      topic: 'testTopic',
    },
  });
});

test('Test that disconnect() sends correct RPC request', async () => {
  expect.assertions(2);

  eventhub.disconnect();

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'disconnect',
    params: [],
  });

  expect(emitEventSpy).toHaveBeenCalledWith('disconnect');
});

test('Test that isSubscribe is true for subscribed topic', () => {
  expect.assertions(1);

  eventhub.subscribe('testTopic', function (msg) {
    subscribeCallbackResolve(true);
  });

  expect(eventhub.isSubscribed('testTopic')).toEqual(true);
});

test('Expect subscribe callback to be called when we recieve a message', async () => {
  expect.assertions(1);

  eventhub.subscribe('testTopic', function (msg) {
    subscribeCallbackResolve(true);
  });

  wsClient.send(
    '{"id":1,"jsonrpc":"2.0","result":{"id":"1573183666822-0","message":"Test message","topic":"testTopic"}}'
  );

  const resp = await waitForSubscribeCallback();

  expect(resp).toBe(true);
});

test('Test that publish() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.publish('testTopic', 'Test message');
  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'publish',
    params: {
      topic: 'testTopic',
      message: 'Test message',
    },
  });
});

test('Test that unsubscribe() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.subscribe('testTopic', function (msg) {
    subscribeCallbackResolve(true);
  });

  await waitForWSResponse();

  eventhub.unsubscribe('testTopic');

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 2,
    jsonrpc: '2.0',
    method: 'unsubscribe',
    params: ['testTopic'],
  });
});

test('Test that isSubscribe is false after unsubscribe', async () => {
  expect.assertions(1);

  eventhub.subscribe('testTopic', function (msg) {
    subscribeCallbackResolve(true);
  });

  await waitForWSResponse();

  eventhub.unsubscribe('testTopic');

  await waitForWSResponse();

  expect(eventhub.isSubscribed('testTopic')).toEqual(false);
});

test('Test that unsubscribeAll() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.subscribe('testTopic', function (msg) {
    subscribeCallbackResolve(true);
  });

  await waitForWSResponse();

  eventhub.unsubscribeAll();

  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 2,
    jsonrpc: '2.0',
    method: 'unsubscribeAll',
    params: [],
  });
});

test('Test that unsubscribeAll unsubscribes all subscribed topics', () => {
  eventhub.subscribe('testTopic1', () => {});
  eventhub.subscribe('testTopic2', () => {});
  eventhub.subscribe('testTopic3', () => {});
  eventhub.subscribe('testTopic4', () => {});

  eventhub.unsubscribeAll();

  expect(eventhub.isSubscribed('testTopic1')).toEqual(false);
  expect(eventhub.isSubscribed('testTopic2')).toEqual(false);
  expect(eventhub.isSubscribed('testTopic3')).toEqual(false);
  expect(eventhub.isSubscribed('testTopic4')).toEqual(false);
});

test('Test that reconnect event is emitted', async () => {
  await new Promise((resolve) => closeServer(testServer, resolve));
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(emitEventSpy).toHaveBeenCalledWith('offline', expect.anything());
  expect(emitEventSpy).toHaveBeenCalledWith('reconnect');
});

test('Test that get() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.get('foo');
  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'get',
    params: {
      key: 'foo',
    },
  });
});

test('Test that set() without ttl sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.set('foo', 'bar');
  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'set',
    params: {
      key: 'foo',
      value: 'bar',
    },
  });
});

test('Test that set() with ttl sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.set('foo', 'bar', 60);
  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'set',
    params: {
      key: 'foo',
      value: 'bar',
      ttl: 60,
    },
  });
});

test('Test that del() sends correct RPC request', async () => {
  expect.assertions(1);

  eventhub.del('foo');
  const resp = await waitForWSResponse();

  expect(resp).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'del',
    params: {
      key: 'foo',
    },
  });
});
