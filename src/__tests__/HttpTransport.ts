import * as http from 'node:http';
import { Readable, PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { JSONCodec } from 'nats';
import {
  BaseMethod,
  Baggage,
  CacheSettings,
  CallOptions,
  Client,
  container,
  DependencyType,
  inject,
  MethodContext,
  MethodOptions,
  Service,
  ServiceMiddlewareContext,
} from '..';

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('HTTP transport lifecycle', () => {
  const servers: http.Server[] = [];
  const addresses = new Map<string, { ip: string; port: number }>();
  const broker = {
    subscribe: () => Readable.from([]),
    request: jest.fn(async (subject: string, data?: unknown, options?: { timeout: number }) => ({
      data: JSONCodec().encode(addresses.get(subject.split('.')[0])),
    })),
  };

  const settings = (options: MethodOptions = {}) => ({
    action: 'run',
    options: { useStream: { response: true }, ...options },
  });

  const clientType = (name: string, options: MethodOptions = {}) =>
    class TestClient extends Client {
      constructor(connection: any = broker, baggage?: Baggage, cache?: CacheSettings) {
        super({ broker: connection, serviceName: name, baggage, cache });
      }
      public run(payload: any = {}, callOptions?: CallOptions) {
        return this.request(`${name}.run`, payload, settings(options), callOptions);
      }
    };

  const startServer = async (handler: http.RequestListener, name = 'Test') => {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    addresses.set(name, { ip: '127.0.0.1', port: (server.address() as any).port });
    return server;
  };

  const startService = async (name: string, Method: any, middleware?: any) => {
    const service = new Service({ name, methods: [Method], brokerConnection: broker as any, middleware });
    service['httpMethods'].set('run', Method);
    jest.spyOn(service as any, 'getMyIpV4').mockReturnValue('127.0.0.1');
    await service['buildHTTPHandlers']();
    servers.push(service['httpServer']!);
    addresses.set(name, service['getHttpSettings']() as any);
    return service;
  };

  beforeEach(() => {
    broker.request.mockReset().mockImplementation(async (subject: string) => ({
      data: JSONCodec().encode(addresses.get(subject.split('.')[0])),
    }));
    jest.spyOn(Service.prototype as any, 'createTracer').mockImplementation(() => undefined);
    process.env.DEFAULT_RESPONSE_TIMEOUT = '1000';
  });

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    addresses.clear();
    jest.restoreAllMocks();
    broker.request.mockClear();
  });

  test('rejects an already aborted call without discovery', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new (clientType('Test'))().run({}, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(broker.request).not.toHaveBeenCalled();
  });

  test.each(['abort', 'deadline'])('stops address discovery on %s without starting HTTP later', async mode => {
    const discovered = deferred<any>();
    const onRequest = jest.fn();
    await startServer(onRequest);
    broker.request.mockImplementationOnce(() => discovered.promise);
    const controller = new AbortController();
    const client = new (clientType('Test', { timeout: 40 }))();
    const call = client.run({}, { signal: controller.signal });
    const assertion = expect(call).rejects.toMatchObject({ name: mode === 'abort' ? 'AbortError' : 'TimeoutError' });
    if (mode === 'abort') controller.abort();
    await assertion;
    discovered.resolve({ data: JSONCodec().encode(addresses.get('Test')) });
    await delay(10);
    expect(onRequest).not.toHaveBeenCalled();
    expect(broker.request.mock.calls[0][2]!.timeout).toBeLessThanOrEqual(40);
  });

  test.each(['abort', 'deadline'])('terminates a call stalled before response headers on %s', async mode => {
    const arrived = deferred();
    const closed = deferred();
    await startServer((request, response) => {
      request.resume();
      response.on('close', () => closed.resolve());
      arrived.resolve();
    });
    const controller = new AbortController();
    const call = new (clientType('Test', { timeout: 100 }))().run({}, { signal: controller.signal });
    const assertion = expect(call).rejects.toMatchObject({ name: mode === 'abort' ? 'AbortError' : 'TimeoutError' });
    await arrived.promise;
    if (mode === 'abort') controller.abort();
    await assertion;
    await closed.promise;
  });

  test.each(['abort', 'deadline'])('destroys a returned stream stalled mid-body on %s', async mode => {
    const closed = deferred();
    await startServer((request, response) => {
      request.resume();
      response.write('first');
      response.on('close', () => closed.resolve());
    });
    const controller = new AbortController();
    const stream = await new (clientType('Test', { timeout: 100 }))().run({}, { signal: controller.signal });
    const read = (async () => {
      for await (const chunk of stream) {
        expect(chunk.toString()).toBe('first');
        if (mode === 'abort') controller.abort();
      }
    })();
    await expect(read).rejects.toMatchObject({ name: mode === 'abort' ? 'AbortError' : 'TimeoutError' });
    await closed.promise;
  });

  test('bounds JSON response reads, not only streamed responses', async () => {
    await startServer((request, response) => {
      request.resume();
      response.write('{"payload":');
    });
    await expect(
      new (clientType('Test', { useStream: { request: false }, timeout: 50 }))().run(),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  test('does not reset the deadline after discovery', async () => {
    const arrived = deferred();
    await startServer((request, response) => {
      request.resume();
      arrived.resolve();
      const timer = setTimeout(() => response.end('late'), 150);
      response.once('close', () => clearTimeout(timer));
    });
    broker.request.mockImplementationOnce(async () => {
      await delay(100);
      return { data: JSONCodec().encode(addresses.get('Test')) };
    });
    const call = new (clientType('Test', { timeout: 200 }))().run();
    const assertion = expect(call).rejects.toMatchObject({ name: 'TimeoutError' });
    await arrived.promise;
    await assertion;
  });

  test('handles prematurely closed JSON bodies without unhandled rejections', async () => {
    await startServer((request, response) => {
      request.resume();
      response.write('{"payload":');
      response.socket!.destroy();
    });
    await expect(new (clientType('Test', { useStream: { request: false } }))().run()).rejects.toThrow();
  });

  test('does not let an explicit signal override parent cancellation', async () => {
    const arrived = deferred();
    await startServer(request => {
      request.resume();
      arrived.resolve();
    });
    const parent = new AbortController();
    const explicit = new AbortController();
    const call = new (clientType('Test'))().withSignal(parent.signal).run({}, { signal: explicit.signal });
    const assertion = expect(call).rejects.toThrow('parent cancelled');
    await arrived.promise;
    parent.abort(new Error('parent cancelled'));
    await assertion;
    expect(explicit.signal.aborted).toBe(false);
  });

  test.each(['abort', 'deadline'])('bounds cache lookup on %s without starting discovery', async mode => {
    const controller = new AbortController();
    const cache: CacheSettings = {
      service: {
        get: jest.fn(
          () =>
            new Promise<string>(() => {
              // Simulate a cache adapter that never settles.
            }),
        ),
        set: jest.fn(),
        delete: jest.fn(),
      },
      timeout: 10_000,
    };
    const client = new (clientType('Test', { cache: 1, timeout: 40 }))(broker, undefined, cache);
    const call = client.run({}, { signal: controller.signal });
    const assertion = expect(call).rejects.toMatchObject({ name: mode === 'abort' ? 'AbortError' : 'TimeoutError' });
    if (mode === 'abort') controller.abort();
    await assertion;
    expect(broker.request).not.toHaveBeenCalled();
  });

  test('stops the upload source on external cancellation', async () => {
    const arrived = deferred();
    await startServer(request => {
      request.resume();
      arrived.resolve();
    });
    const source = new PassThrough();
    const controller = new AbortController();
    const call = new (clientType('Test', { useStream: { request: true } }))().run(source, {
      signal: controller.signal,
    });
    const assertion = expect(call).rejects.toMatchObject({ name: 'AbortError' });
    source.write('first');
    await arrived.promise;
    controller.abort();
    await assertion;
    expect(source.destroyed).toBe(true);
  });

  test('removes abort listeners after successful completion', async () => {
    await startServer((request, response) => {
      request.resume();
      response.end('done');
    });
    const controller = new AbortController();
    const add = jest.spyOn(controller.signal, 'addEventListener');
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    const stream = await new (clientType('Test'))().run({}, { signal: controller.signal });
    for await (const chunk of stream) expect(chunk.toString()).toBe('done');
    expect(remove.mock.calls.map(args => args[1])).toEqual(add.mock.calls.map(args => args[1]));
    controller.abort();
    expect(stream.readableEnded).toBe(true);
  });

  test.each([false, true])('enforces the byte limit (Content-Length: %s)', async contentLength => {
    class Upload extends BaseMethod {
      static settings = settings({ useStream: { request: true, maxRequestBytes: 4 } });
      public async handler(input: Readable) {
        let bytes = 0;
        for await (const chunk of input) bytes += chunk.length;
        return { bytes };
      }
    }
    await startService('Upload', Upload);
    const upload = async (chunks: string[]) => {
      const address = addresses.get('Upload')!;
      return new Promise<{ status: number; body: any }>((resolve, reject) => {
        const request = http.request(
          {
            host: address.ip,
            port: address.port,
            path: '/Upload/run',
            method: 'POST',
            headers: contentLength ? { 'Content-Length': chunks.join('').length } : {},
          },
          response => {
            const read = async () => {
              const data: Buffer[] = [];
              for await (const chunk of response) data.push(chunk);
              return { status: response.statusCode!, body: JSON.parse(Buffer.concat(data).toString()) };
            };
            read().then(resolve, reject);
          },
        );
        request.on('error', reject);
        chunks.forEach(chunk => request.write(chunk));
        request.end();
      });
    };
    await expect(upload(['ab', 'cd'])).resolves.toMatchObject({ status: 200, body: { payload: { bytes: 4 } } });
    await expect(upload(['ab', 'cde'])).resolves.toMatchObject({ status: 413, body: { error: { code: 413 } } });
  });

  test('reports HTTP 413 as an error, not as a successful response stream', async () => {
    await startServer((request, response) => {
      request.resume();
      response.writeHead(413).end(JSON.stringify({ error: { message: 'Too large', code: 413 } }));
    });
    await expect(new (clientType('Test'))().run()).rejects.toThrow('Too large');
  });

  test('rejects overflow even if the handler catches the stream error', async () => {
    class Upload extends BaseMethod {
      static settings = settings({ useStream: { request: true, maxRequestBytes: 4 } });
      public async handler(input: Readable) {
        try {
          for await (const chunk of input) {
            /* consume */
          }
        } catch {
          return 'ignored';
        }
      }
    }
    await startService('Upload', Upload);
    const client = new (clientType('Upload', { useStream: { request: true } }))();
    await expect(client.run(Readable.from([Buffer.from('12345')]))).rejects.toThrow('exceeds 4 bytes');
  });

  test.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid byte limit %s', limit => {
    class Upload extends BaseMethod {
      static settings = settings({ useStream: { request: true, maxRequestBytes: limit } });
      public async handler() {
        return undefined;
      }
    }
    expect(() => new Service({ name: 'Upload', methods: [Upload] })).toThrow('positive safe integer');
  });

  test.each([false, true])('only cancels disconnect-enabled handlers (enabled: %s)', async enabled => {
    const entered = deferred<AbortSignal>();
    const release = deferred();
    class Work extends BaseMethod {
      static settings = settings({ useStream: { response: true, cancelOnDisconnect: enabled } });
      public async handler(_: unknown, { signal }: MethodContext) {
        entered.resolve(signal);
        await release.promise;
        return 'done';
      }
    }
    await startService('Work', Work);
    const controller = new AbortController();
    const call = new (clientType('Work'))().run({}, { signal: controller.signal });
    const assertion = expect(call).rejects.toMatchObject({ name: 'AbortError' });
    const signal = await entered.promise;
    controller.abort();
    await assertion;
    // Wait for the server-side close event, not just the local request error.
    await delay(20);
    expect(signal.aborted).toBe(enabled);
    release.resolve();
  });

  test('does not abort a handler signal after normal streamed completion', async () => {
    let signal!: AbortSignal;
    class Work extends BaseMethod {
      static settings = settings({ useStream: { response: true, cancelOnDisconnect: true } });
      public async handler(_: unknown, context: MethodContext) {
        signal = context.signal;
        return Readable.from([Buffer.from('done')]);
      }
    }
    await startService('Work', Work);
    const response = await new (clientType('Work'))().run();
    for await (const chunk of response) expect(chunk.toString()).toBe('done');
    await delay(10);
    expect(signal.aborted).toBe(false);
  });

  test.each(['property', 'constructor'])('cancels the HTTP service chain through %s injection', async injection => {
    const stopped = deferred();
    let leafSignal!: AbortSignal;
    let gateSignal!: AbortSignal;
    const key = Symbol('leaf');
    const LeafClient = clientType('Leaf');
    container.bind(key, DependencyType.SERVICE, LeafClient);
    class Leaf extends BaseMethod {
      static settings = settings({ useStream: { response: true, cancelOnDisconnect: true } });
      public async handler(_: unknown, { signal }: MethodContext) {
        leafSignal = signal;
        signal.addEventListener('abort', () => stopped.resolve(), { once: true });
        return Readable.from(
          (async function* () {
            yield Buffer.from('first');
            await delay(10_000, undefined, { signal });
          })(),
        );
      }
    }
    class PropertyGate extends BaseMethod {
      static settings = Leaf.settings;
      @inject(key) private leaf!: InstanceType<typeof LeafClient>;
      public async handler(_: unknown, { signal }: MethodContext) {
        gateSignal = signal;
        return this.leaf.run();
      }
    }
    class ConstructorGate extends BaseMethod {
      static settings = Leaf.settings;
      constructor(@inject(key) private leaf: InstanceType<typeof LeafClient>) {
        super();
      }
      public async handler(_: unknown, { signal }: MethodContext) {
        gateSignal = signal;
        return this.leaf.run();
      }
    }
    await startService('Leaf', Leaf);
    await startService('Gate', injection === 'property' ? PropertyGate : ConstructorGate);
    const controller = new AbortController();
    const response = await new (clientType('Gate'))().run({}, { signal: controller.signal });
    const reading = (async () => {
      for await (const chunk of response) {
        expect(chunk.toString()).toBe('first');
        controller.abort();
      }
    })();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    await stopped.promise;
    expect(gateSignal.aborted).toBe(true);
    expect(leafSignal.aborted).toBe(true);
    container.unbind(key);
  });

  test('forwards call options through service middleware', async () => {
    await startServer((request, response) => {
      request.resume();
      response.end('done');
    });
    const key = Symbol('middleware');
    const controller = new AbortController();
    class Before {
      public run(context: ServiceMiddlewareContext) {
        expect(context.callOptions?.signal).toBe(controller.signal);
      }
    }
    container.bind(key, DependencyType.ADAPTER, Before);
    const gate = new Service({
      name: 'Gate',
      methods: [],
      brokerConnection: broker as any,
      middleware: { service: { before: [key] } },
    });
    const response = await gate.buildService(clientType('Test')).run({}, { signal: controller.signal });
    for await (const chunk of response) expect(chunk.toString()).toBe('done');
    container.unbind(key);
  });

  test('preserves NATS without explicit cancellation, including inherited signals', async () => {
    const ClientType = clientType('Test', { useStream: undefined });
    broker.request.mockResolvedValueOnce({ data: JSONCodec().encode({ payload: 42 }) });
    const client = new ClientType().withSignal(AbortSignal.abort());
    await expect(client.run()).resolves.toBe(42);
    broker.request.mockClear();
    await expect(client.run({}, { signal: new AbortController().signal })).rejects.toThrow('not supported');
    expect(broker.request).not.toHaveBeenCalled();
  });
});
