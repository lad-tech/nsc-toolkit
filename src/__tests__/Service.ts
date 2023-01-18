import { Service, BaseMethod } from '../';
import { EmitterMath } from '../../examples/MathService/interfaces';
import { name, events, methods } from './fixtures/MathService/math.service.json';
import * as http from 'http';
import { EventEmitter, PassThrough, Readable } from 'stream';
import { JSONCodec } from 'nats';
import { setTimeout } from 'timers/promises';
import { trace } from '@opentelemetry/api';
import { SumServiceRelation } from './fixtures/MathService/methods/SumServiceRelation';
import { SumInstanceRelation } from './fixtures/MathService/methods/SumInstanceRelation';

jest.mock('./fixtures/MathService');

describe('Testing Service class methods', () => {
  const jetstreamSubscribeMock = jest.fn();
  const jsmManagerMock = {
    streams: {
      info: jest.fn(),
      add: jest.fn(),
      update: jest.fn(),
    },
  };
  const broker = {
    subscribe: jest.fn(),
    request: jest.fn(),
    drain: jest.fn(),
    jetstreamManager: jest.fn().mockResolvedValue(jsmManagerMock),
    jetstream: () => ({
      subscribe: jetstreamSubscribeMock,
    }),
  };

  const codec = JSONCodec();

  const getMethod = (handler: jest.Mock, settings: any) =>
    class Method extends BaseMethod {
      static settings = settings;
      public handler = handler;
    };

  const createServerMock = jest.spyOn(http, 'createServer');

  const getHttpServerMock: () => http.Server = () => {
    const emitter = new EventEmitter();
    emitter['listen'] = jest.fn();
    emitter['close'] = jest.fn();
    emitter['address'] = () => 5000;
    return emitter as any;
  };

  describe('Base', () => {
    const mathService = new Service<EmitterMath>({
      name,
      brokerConnection: broker as any,
      methods: [],
      events,
    });

    test('Service without methods and with already created streams starts successfully', async () => {
      createServerMock.mockReturnValue(getHttpServerMock());
      jsmManagerMock.streams.info.mockResolvedValue({});
      jsmManagerMock.streams.update.mockResolvedValue('Ok');
      await expect(mathService.start()).resolves.not.toThrow();
    });
    test('Service without methods creates streams and starts successfully', async () => {
      const error = new Error('stream not found');
      error.name = 'NatsError';
      createServerMock.mockReturnValue(getHttpServerMock());
      jsmManagerMock.streams.info.mockRejectedValue(error);
      jsmManagerMock.streams.add.mockResolvedValue('Ok');
      await expect(mathService.start()).resolves.not.toThrow();
    });
  });

  describe('Successful processing of requests', () => {
    test('Request do not stream, response do not stream', async () => {
      const request = { payload: { a: 5, b: 5 } };
      const response = { result: request.payload.a + request.payload.b };

      const handler = jest.fn().mockResolvedValue(response);
      const subscription = new PassThrough({ objectMode: true });
      const respond = jest.fn();

      broker.subscribe.mockReturnValue(subscription);
      const mathService = new Service<EmitterMath>({
        name,
        brokerConnection: broker as any,
        methods: [getMethod(handler, methods.Sum) as any],
      });

      await mathService.start();

      subscription.push({ data: codec.encode(request), respond });
      subscription.end();
      await setTimeout(1);
      expect(respond).toBeCalledWith(codec.encode({ payload: response }));
    });

    test('Stream request, no response', async () => {
      const request = Readable.from(['1', '2', '3', '4']);
      request['method'] = 'POST';
      request['url'] = 'test.com/Math/sumstream';
      request['headers'] = {};

      const methodResponse = { result: 10 };
      const server = getHttpServerMock();
      const probServer = getHttpServerMock();
      (server.listen as jest.Mock).mockImplementation((port: number, cb: () => void) => {
        if (cb) {
          cb();
        }
        return server;
      });
      createServerMock.mockReturnValueOnce(server);
      createServerMock.mockReturnValueOnce(probServer);
      const handler = jest.fn().mockResolvedValue(methodResponse);
      const subscription = new PassThrough({ objectMode: true });
      const response = new PassThrough({ objectMode: true });
      response['writeHead'] = () => response;

      broker.subscribe.mockReturnValue(subscription);
      const mathService = new Service<EmitterMath>({
        name,
        brokerConnection: broker as any,
        methods: [getMethod(handler, methods.SumStream) as any],
      });

      let result = '';

      response.on('data', data => {
        result = JSON.stringify({ payload: methodResponse });
      });

      await mathService.start();

      server.emit('request', request, response);
      await setTimeout(1);

      expect(result).toBe(JSON.stringify({ payload: methodResponse }));
    });

    test('Stream request, stream response', async () => {
      const request = Readable.from(['1', '2', '3', '4']);
      request['method'] = 'POST';
      request['url'] = 'test.com/Math/multiply';
      request['headers'] = {};
      const streamResponse = ['1', '4', '9', '16'];

      const methodResponse = Readable.from(streamResponse);
      const server = getHttpServerMock();
      const probServer = getHttpServerMock();
      (server.listen as jest.Mock).mockImplementation((port: number, cb: () => void) => {
        if (cb) {
          cb();
        }
        return server;
      });
      createServerMock.mockReturnValueOnce(server);
      createServerMock.mockReturnValueOnce(probServer);
      const handler = jest.fn().mockResolvedValue(methodResponse);
      const subscription = new PassThrough({ objectMode: true });
      const response = new PassThrough({ objectMode: true });
      response['writeHead'] = () => response;

      broker.subscribe.mockReturnValue(subscription);
      const mathService = new Service<EmitterMath>({
        name,
        brokerConnection: broker as any,
        methods: [getMethod(handler, methods.Multiply) as any],
      });

      const result: string[] = [];

      response.on('data', data => {
        result.push(JSON.parse(data));
      });

      await mathService.start();

      server.emit('request', request, response);
      await setTimeout(1);

      expect(result).toMatchObject(streamResponse);
    });

    test('Request not stream, response stream', async () => {
      const request = { payload: { length: 4 } };
      const httpRequest = new PassThrough({ objectMode: true });

      httpRequest.write(Buffer.from(JSON.stringify(request)));
      httpRequest.end();

      httpRequest['method'] = 'POST';
      httpRequest['url'] = 'test.com/Math/fibonacci';
      httpRequest['headers'] = {};
      const streamResponse = ['1', '1', '2', '3'];

      const methodResponse = Readable.from(streamResponse);
      const server = getHttpServerMock();
      const probServer = getHttpServerMock();
      (server.listen as jest.Mock).mockImplementation((port: number, cb: () => void) => {
        if (cb) {
          cb();
        }
        return server;
      });
      createServerMock.mockReturnValueOnce(server);
      createServerMock.mockReturnValueOnce(probServer);
      const handler = jest.fn().mockResolvedValue(methodResponse);
      const subscription = new PassThrough({ objectMode: true });
      const response = new PassThrough({ objectMode: true });
      response['writeHead'] = () => response;

      broker.subscribe.mockReturnValue(subscription);
      const mathService = new Service<EmitterMath>({
        name,
        brokerConnection: broker as any,
        methods: [getMethod(handler, methods.Fibonacci) as any],
      });

      const result: string[] = [];

      response.on('data', data => {
        result.push(JSON.parse(data));
      });

      await mathService.start();

      server.emit('request', httpRequest, response);
      await setTimeout(1);
      expect(result).toMatchObject(streamResponse);
    });
  });

  describe('Other', () => {
    const mathService = new Service<EmitterMath>({
      name,
      brokerConnection: broker as any,
      methods: [],
      events,
    });

    test('Service stops successfully', async () => {
      const message = 'Success exit';
      jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(message);
      });
      createServerMock.mockReturnValue(getHttpServerMock());
      jsmManagerMock.streams.info.mockResolvedValue({});
      jsmManagerMock.streams.update.mockResolvedValue('Ok');

      await mathService.start();

      await expect(mathService.stop()).rejects.toThrowError(message);
    });

    test('Successfully creates and completes a trace based on external baggage', async () => {
      const endSpan = jest.fn();
      jest.spyOn(trace, 'getTracer').mockImplementation(
        () =>
          ({
            startSpan: () => ({
              spanContext: () => ({
                traceId: '1',
                spanId: '3',
                traceFlags: 1,
              }),
              setAttribute: jest.fn(),
              end: endSpan,
            }),
          } as any),
      );

      const headers = {
        'nsc-expired': '2000',
        'nsc-trace-id': '1',
        'nsc-span-id': '2',
        'nsc-trace-flags': '1',
      } as any;

      createServerMock.mockReturnValue(getHttpServerMock());
      jsmManagerMock.streams.info.mockResolvedValue({});
      jsmManagerMock.streams.update.mockResolvedValue('Ok');

      await mathService.start();

      const baggage = mathService.getRootBaggage('test', headers, 1000);
      mathService.endRootSpan(baggage.traceId);

      expect(endSpan).toBeCalled();
    });

    test('Successfully injecting a service as a dependency', async () => {
      const request = { payload: { a: 5, b: 5 } };
      const respond = jest.fn();
      const subscription = new PassThrough({ objectMode: true });

      broker.subscribe.mockReturnValue(subscription);
      const mathService = new Service<EmitterMath>({
        name,
        brokerConnection: broker as any,
        methods: [SumServiceRelation],
      });

      await mathService.start();

      subscription.push({ data: codec.encode(request), respond });
      subscription.end();
      await setTimeout(1);

      expect(respond).toBeCalledWith(codec.encode({ payload: { result: 10 } }));
    });

    test('Successful injection of an object with asynchronous methods as a dependency', async () => {
      const request = { payload: { a: 5, b: 5 } };
      const respond = jest.fn();
      const subscription = new PassThrough({ objectMode: true });

      broker.subscribe.mockReturnValue(subscription);
      const mathService = new Service<EmitterMath>({
        name,
        brokerConnection: broker as any,
        methods: [SumInstanceRelation],
      });

      await mathService.start();

      subscription.push({ data: codec.encode(request), respond });
      subscription.end();
      await setTimeout(1);

      expect(respond).toBeCalledWith(codec.encode({ payload: { result: 10 } }));
    });
  });
});
