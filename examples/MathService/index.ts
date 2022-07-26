import { Client } from '../../src/Client';
import { NatsConnection } from 'nats';
import { SumRequest, SumResponse, EmitterMath, SumStreamResponse, FibonacciRequest } from './interfaces';
import { Baggage, CacheSettings } from '../../src/interfaces';
import { name, methods } from './service.json';
import { Readable } from 'stream';
export * from './interfaces';

export default class ServiceMathClient extends Client<EmitterMath> {
  constructor(nats: NatsConnection, baggage?: Baggage, cacheSettings?: CacheSettings) {
    super(nats, name, baggage, cacheSettings);
  }
  public async sum(payload: SumRequest) {
    return this.request<SumResponse>(`${name}.${methods.Sum.action}`, payload, methods.Sum);
  }
  public async sumStream(payload: Readable) {
    return this.request<SumStreamResponse>(`${name}.${methods.SumStream.action}`, payload, methods.SumStream);
  }
  public async fibonacci(payload: FibonacciRequest) {
    return this.request<Readable>(`${name}.${methods.Fibonacci.action}`, payload, methods.Fibonacci);
  }
}
