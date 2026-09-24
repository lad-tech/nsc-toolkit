import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { BaseMethod, MethodContext, Service } from '../';

describe('Method handler context', () => {
  const service = new Service({ name: 'ContextTest', methods: [] });
  const run = (handler: (payload: any, context: MethodContext) => Promise<any>, expired?: number, stream = false) => {
    class Method extends BaseMethod {
      static settings = { action: 'run', options: { useStream: { response: stream } } };
      public handler = handler;
    }
    return service['handled']({ value: 1 }, Method, { expired });
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('passes the payload and cancels at the absolute deadline', async () => {
    let signal: AbortSignal;
    const handler = jest.fn(async (payload, context: MethodContext) => {
      signal = context.signal;
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      return payload;
    });
    const result = run(handler, Date.now() + 100);
    expect(handler).toHaveBeenCalledWith({ value: 1 }, { signal: signal! });
    jest.advanceTimersByTime(99);
    expect(signal!.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal!.aborted).toBe(true);
    expect(signal!.reason.name).toBe('TimeoutError');
    await expect(result).resolves.toEqual({ payload: { value: 1 } });
  });

  test.each([0, -1])('provides an already aborted signal for expired deadline %s', async expired => {
    await run(async (_, { signal }) => {
      expect(signal.aborted).toBe(true);
      signal.throwIfAborted();
    }, expired);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('does not schedule a timer without a deadline', async () => {
    await run(async (_, { signal }) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  test.each([false, true])('cleans up after a handler settles (failure: %s)', async failure => {
    let signal: AbortSignal;
    const result = await run(async (_, context) => {
      signal = context.signal;
      if (failure) throw new Error('failed');
      return 42;
    }, Date.now() + 100);
    expect(result).toEqual(
      failure ? { payload: null, error: { message: 'failed', code: undefined } } : { payload: 42 },
    );
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(100);
    expect(signal!.aborted).toBe(false);
  });

  test('isolates concurrent requests', async () => {
    const signals: AbortSignal[] = [];
    const handler = async (_, { signal }: MethodContext) => {
      signals.push(signal);
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
    };
    const first = run(handler, Date.now() + 100);
    const second = run(handler, Date.now() + 200);
    expect(signals[0]).not.toBe(signals[1]);
    jest.advanceTimersByTime(100);
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    await first;
    jest.advanceTimersByTime(100);
    await second;
    expect(signals[1].aborted).toBe(true);
  });

  test('keeps the signal alive while a returned stream produces data', async () => {
    jest.useRealTimers();
    const result = await run(
      async (_, { signal }) => {
        return Readable.from(
          (async function* () {
            await delay(10_000, undefined, { signal });
            yield 'late';
          })(),
        );
      },
      Date.now() + 50,
      true,
    );
    await expect(
      (async () => {
        for await (const chunk of result.payload) {
          throw new Error(`Unexpected chunk: ${chunk}`);
        }
      })(),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  test.each(['end', 'destroy', 'error'])('cleans up a stream deadline on %s', async mode => {
    const stream = new Readable({ read() {} });
    stream.on('error', () => {});
    const completion = finished(stream).catch(() => {});
    await run(async () => stream, Date.now() + 100, true);
    expect(jest.getTimerCount()).toBe(1);
    if (mode === 'end') {
      stream.resume();
      stream.push(null);
    } else {
      stream.destroy(mode === 'error' ? new Error('stream failed') : undefined);
    }
    jest.runAllTicks();
    await completion;
    expect(jest.getTimerCount()).toBe(0);
  });
});
