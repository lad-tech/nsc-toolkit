import type { NatsConnection } from 'nats';
import type { Readable } from 'stream';
import { Client } from '../../src/Client';
import type { Baggage, CacheSettings, CallOptions } from '../../src/interfaces';
import type { EmitterMathExternal, FibonacciRequest, SumRequest, SumResponse, SumStreamResponse } from './interfaces';
import { events, methods, name, Ref } from './service.schema.json';

export default class ServiceMathClient extends Client<EmitterMathExternal> {
  constructor(broker: NatsConnection, baggage?: Baggage, cache?: CacheSettings) {
    super({ broker, serviceName: name, baggage, cache, events, Ref });
  }
  public async sum(payload: SumRequest) {
    return this.request<SumResponse>(`${name}.${methods.Sum.action}`, payload, methods.Sum);
  }
  public async sumStream(payload: Readable, callOptions?: CallOptions) {
    return this.request<SumStreamResponse>(
      `${name}.${methods.SumStream.action}`,
      payload,
      methods.SumStream,
      callOptions,
    );
  }
  public async fibonacci(payload: FibonacciRequest, callOptions?: CallOptions) {
    return this.request<Readable>(`${name}.${methods.Fibonacci.action}`, payload, methods.Fibonacci, callOptions);
  }
}
