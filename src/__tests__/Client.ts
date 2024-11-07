import { JSONCodec } from 'nats';

import { PassThrough, EventEmitter, Readable } from 'node:stream';
import * as http from 'node:http';
import { MathClient } from './fixtures/MathService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Testing Client class methods', () => {
  const jetstreamSubscribeMock = jest.fn();
  const jetstreamFetchMock = jest.fn();
  const jetstreamManagerStreamsFindMock = jest.fn();
  const jetstreamManagerConsumersAdd = jest.fn();
  const broker = {
    subscribe: jest.fn(),
    request: jest.fn(),
    jetstream: () => ({
      subscribe: jetstreamSubscribeMock,
      consumers: {
        get: jest.fn().mockResolvedValue({
          fetch: jetstreamFetchMock,
        }),
      },
    }),
    jetstreamManager: jest.fn().mockResolvedValue({
      streams: {
        find: jetstreamManagerStreamsFindMock.mockResolvedValue('TestStream'),
      },
      consumers: {
        add: jetstreamManagerConsumersAdd.mockResolvedValue(true),
        info: jetstreamManagerConsumersAdd.mockResolvedValue(false),
      },
    }),
  };

  const codec = JSONCodec();

  const mathClient = new MathClient(broker as any, {
    spanId: '1',
    traceId: '1',
    traceFlags: 1,
    expired: Date.now() + 50000,
  });

  describe('Events (subscribe/unsubscribe)', () => {
    test('Successfully returns an EventEmitter object for the event subscription', () => {
      const result = mathClient.getListener('Test');
      expect(result).toMatchObject(new EventEmitter());
    });

    test('Successful subscription and event processing for a non-streaming event', () => {
      const payload = { data: { method: 'test' } };
      const subscribe = new PassThrough({ objectMode: true });
      broker.subscribe.mockReturnValue(subscribe);

      const result = mathClient.getListener('Test');

      result.on('Notify', event => {
        expect(event.data.method).toBe(payload.data.method);
      });

      subscribe.write({ data: codec.encode(payload.data) });
    });

    test('Successful subscription and event processing for a streaming event', () => {
      const payload = { data: { elapsed: 42 } };
      const subscribe = new PassThrough({ objectMode: true });
      jetstreamSubscribeMock.mockReturnValue(subscribe);

      const result = mathClient.getListener('Test');

      result.on('Elapsed', event => {
        expect(event.data.elapsed).toBe(payload.data.elapsed);
      });

      subscribe.write({ data: codec.encode(payload.data), sid: '1', ack: jest.fn(), nak: jest.fn() });
    });

    test('Successful unsubscribe from the event', () => {
      const subscribe = new PassThrough();
      subscribe['unsubscribe'] = jest.fn();
      broker.subscribe.mockReturnValue(subscribe);

      const result = mathClient.getListener('Test');

      const handler = () => {
        return;
      };

      result.on('Notify', handler);
      result.off('Notify', handler);

      expect((subscribe as any).unsubscribe).toBeCalledTimes(1);
    });
  });

  describe('Fetch event batch', () => {
    test('Successful fetch events from stream', done => {
      const payload = { data: { elapsed: 42 } };
      const subscribe = new PassThrough({ objectMode: true });
      const secondSubscribe = new PassThrough({ objectMode: true });
      subscribe['close'] = jest.fn().mockResolvedValue('Ok');
      secondSubscribe['close'] = jest.fn().mockResolvedValue('Ok');
      jetstreamFetchMock.mockResolvedValueOnce(subscribe);
      jetstreamFetchMock.mockResolvedValueOnce(secondSubscribe);

      const result = mathClient.getListener('Test', { batch: true });

      result.on('Elapsed', event => {
        expect(event.length).toBe(3);
        done();
      });

      subscribe.write({ data: codec.encode(payload.data), sid: '1', ack: jest.fn(), nak: jest.fn() });
      subscribe.write({ data: codec.encode(payload.data), sid: '2', ack: jest.fn(), nak: jest.fn() });
      subscribe.write({ data: codec.encode(payload.data), sid: '3', ack: jest.fn(), nak: jest.fn() });
      subscribe.end();
    });
  });

  describe('Synchronous client methods', () => {
    broker.request.mockResolvedValue({ data: codec.encode({ ip: 'test', port: 7000 }) });

    test('Stream request, no response', async () => {
      const request = Readable.from(['1', '2', '3', '4']);
      const sumResult = 10;
      jest.spyOn(http, 'request').mockImplementation((options: any, callback: any, option: any) => {
        setTimeout(() => {
          const response = new PassThrough();
          response.write(codec.encode({ payload: { result: sumResult } }));
          response.end();
          callback(response);
        }, 5);
        return new PassThrough() as any;
      });

      const { result } = await mathClient.sumStream(request);
      expect(result).toBe(sumResult);
    });

    test('Stream request, stream response', async () => {
      const request = Readable.from(['1', '2', '3', '4']);
      const response = Readable.from(['1', '4', '9', '16']);
      jest.spyOn(http, 'request').mockImplementation((options: any, callback: any, option: any) => {
        setTimeout(() => {
          callback(response);
        }, 5);
        return new PassThrough() as any;
      });

      const result = await mathClient.multiply(request);
      expect(result).toBe(response);
    });

    test('Request not stream, response stream', async () => {
      const request = { length: 4 };
      const response = Readable.from(['1', '1', '2', '3']);
      jest.spyOn(http, 'request').mockImplementation((options: any, callback: any, option: any) => {
        setTimeout(() => {
          callback(response);
        }, 5);
        return new PassThrough() as any;
      });

      const result = await mathClient.fibonacci(request);
      expect(result).toBe(response);
    });

    test('Request do not stream, response do not stream', async () => {
      const payload = { a: 5, b: 5 };
      const sumResult = payload.a + payload.b;
      broker.request.mockResolvedValue({ data: codec.encode({ payload: { result: sumResult } }) });

      const { result } = await mathClient.sum(payload);
      expect(result).toBe(sumResult);
    });
  });

  describe('Runtime validation', () => {
    test('If the request parameters are incorrect, an error is generated', async () => {
      const payload = { a: 5, x: 5 };

      await expect(mathClient.sum(payload as any)).rejects.toThrow();
    });

    test('If the response is incorrect, an error is generated.', async () => {
      const payload = { a: 5, b: 5 };
      const sumResult = payload.a + payload.b;
      broker.request.mockResolvedValue({ data: codec.encode({ payload: { data: sumResult } }) });

      await expect(mathClient.sum(payload as any)).rejects.toThrow();
    });
  });

  describe('Caching', () => {
    const cacheService = {
      set: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    const mathClient = new MathClient(
      broker as any,
      {
        spanId: '1',
        traceId: '1',
        traceFlags: 1,
        expired: Date.now() + 50000,
      },
      {
        service: cacheService,
        timeout: 200,
      },
    );

    test('The response result is written to the cache', async () => {
      const payload = { a: 5, b: 5 };
      const sumResult = payload.a + payload.b;
      const response = { result: sumResult };
      broker.request.mockResolvedValue({ data: codec.encode({ payload: response }) });
      cacheService.get.mockResolvedValue(null);

      await mathClient.sum(payload);
      expect(cacheService.set.mock.calls[0][1]).toBe(JSON.stringify(response));
    });

    test('The response result is taken from the cache', async () => {
      const payload = { a: 5, b: 5 };
      const sumResult = payload.a + payload.b;
      broker.request.mockResolvedValue({ data: codec.encode({ payload: { result: 0 } }) });
      cacheService.get.mockResolvedValue(JSON.stringify({ result: sumResult }));

      const { result } = await mathClient.sum(payload);
      expect(result).toBe(sumResult);
    });
  });

  describe('Other', () => {
    test('If the end-to-end timeout expires, an error is generated', async () => {
      const mathClient = new MathClient(broker as any, {
        spanId: '1',
        traceId: '1',
        traceFlags: 1,
        expired: Date.now() - 1,
      });

      const payload = { a: 5, b: 5 };

      await expect(mathClient.sum(payload)).rejects.toThrow();
    });

    test('If the request returns an error, then an error is generated', async () => {
      const mathClient = new MathClient(broker as any, {
        spanId: '1',
        traceId: '1',
        traceFlags: 1,
        expired: Date.now() + 50000,
      });

      const payload = { a: 5, b: 5 };
      broker.request.mockResolvedValue({
        data: codec.encode({ payload: null, error: { message: 'Some error', code: 5 } }),
      });

      await expect(mathClient.sum(payload)).rejects.toThrow();
    });
  });
});
