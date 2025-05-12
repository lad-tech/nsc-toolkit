import { Meter } from '../Meter';
import * as opentelemetry from '@opentelemetry/api';

const spanMock = {
  setAttribute: jest.fn(),
  end: jest.fn(),
};

const startSpanMock = jest.fn().mockReturnValue(spanMock);

const errorMessage = 'Some error';
const measuredFunctionSync = (a: number, b: number) => a + b;
const measuredFunctionAsync = (a: number, b: number) => Promise.resolve(a + b);
const measuredFunctionAsyncError = (a: number, b: number) => Promise.reject(new Error(errorMessage));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: startSpanMock,
    }),
    setSpan: jest.fn(),
  },
  context: {
    active: jest.fn(),
  },
  SpanKind: { CONSUMER: 'consumer', CLIENT: 'client' },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Meter class', () => {
  test('Create Meter instance and call start method', () => {
    const meter = new Meter('test');
    meter.start();

    expect(startSpanMock).toBeCalledWith('test', { kind: opentelemetry.SpanKind.CONSUMER }, undefined);
  });

  test('Call end method without error', () => {
    const meter = new Meter('test');
    meter.start();
    meter.end();

    expect(spanMock.end).toBeCalled();
  });

  test('Call end method with error', () => {
    const meter = new Meter('test');

    const error = new Error('Some error');

    meter.start();
    meter.end(error);

    expect(spanMock.setAttribute.mock.calls[0][0]).toBe('error');
    expect(spanMock.setAttribute.mock.calls[0][1]).toBe(true);
    expect(spanMock.setAttribute.mock.calls[1][0]).toBe('error.kind');
    expect(spanMock.setAttribute.mock.calls[1][1]).toBe(error.message);
  });

  test('Calling the end method without the start method', () => {
    const meter = new Meter('test');
    meter.end();

    expect(spanMock.end).not.toBeCalled();
  });

  test('Calling measure method with external api tag', () => {
    const meter = new Meter('test');

    meter.start();

    const result = meter.measure(measuredFunctionSync, [2, 2], undefined, {
      location: 'external',
      type: 'api',
      name: 'helper',
      target: 'math',
    });

    expect(result).toBe(4);

    expect(startSpanMock).toBeCalledWith('measuredFunctionSync', { kind: opentelemetry.SpanKind.CLIENT }, undefined);

    expect(spanMock.setAttribute.mock.calls[0][0]).toBe('net.peer.name');
    expect(spanMock.setAttribute.mock.calls[0][1]).toBe('helper');
    expect(spanMock.setAttribute.mock.calls[1][0]).toBe('http.target');
    expect(spanMock.setAttribute.mock.calls[1][1]).toBe('math');
  });

  test('Calling measure method with external dbms tag', () => {
    const meter = new Meter('test');

    meter.start();

    meter.measure(measuredFunctionSync, [2, 2], undefined, {
      location: 'external',
      type: 'dbms',
      name: 'postgresql',
      target: 'clients',
    });

    expect(spanMock.setAttribute.mock.calls[0][0]).toBe('db.system');
    expect(spanMock.setAttribute.mock.calls[0][1]).toBe('postgresql');
    expect(spanMock.setAttribute.mock.calls[1][0]).toBe('db.name');
    expect(spanMock.setAttribute.mock.calls[1][1]).toBe('clients');
  });

  test('Calling measure method with external dbms tag', () => {
    const meter = new Meter('test');

    meter.start();

    meter.measure(measuredFunctionSync, [2, 2], undefined, {
      location: 'external',
      type: 'dbms',
      name: 'postgresql',
      target: 'clients',
    });

    expect(spanMock.setAttribute.mock.calls[0][0]).toBe('db.system');
    expect(spanMock.setAttribute.mock.calls[0][1]).toBe('postgresql');
    expect(spanMock.setAttribute.mock.calls[1][0]).toBe('db.name');
    expect(spanMock.setAttribute.mock.calls[1][1]).toBe('clients');
  });

  test('Calling measure method with async function', async () => {
    const meter = new Meter('test');

    meter.start();

    const result = await meter.measure(measuredFunctionAsync, [2, 2], undefined, {
      location: 'external',
      type: 'dbms',
      name: 'postgresql',
      target: 'clients',
    });

    expect(result).toBe(4);
  });

  test('Calling measure method with async function and error', async () => {
    const meter = new Meter('test');

    meter.start();

    const errorMessage = 'Some error';

    await expect(
      meter.measure(measuredFunctionAsyncError, [2, 2], undefined, {
        location: 'external',
        type: 'dbms',
        name: 'postgresql',
        target: 'clients',
      }),
    ).rejects.toThrowError(errorMessage);

    expect(spanMock.setAttribute.mock.calls[0][0]).toBe('db.system');
    expect(spanMock.setAttribute.mock.calls[0][1]).toBe('postgresql');
    expect(spanMock.setAttribute.mock.calls[1][0]).toBe('db.name');
    expect(spanMock.setAttribute.mock.calls[1][1]).toBe('clients');

    expect(spanMock.setAttribute.mock.calls[2][0]).toBe('error');
    expect(spanMock.setAttribute.mock.calls[2][1]).toBe(true);
    expect(spanMock.setAttribute.mock.calls[3][0]).toBe('error.kind');
    expect(spanMock.setAttribute.mock.calls[3][1]).toBe(errorMessage);
  });
});
