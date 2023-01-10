import { Client } from '../../src/Client';
import { NatsConnection } from 'nats';
import { SumRequest, SumResponse, EmitterMathExternal, SumStreamResponse, FibonacciRequest } from './interfaces';
import { Baggage, CacheSettings } from '../../src/interfaces';
import { name, methods, events } from './service.json';
import { Readable } from 'stream';

export default class ServiceMathClient extends Client<EmitterMathExternal> {
  constructor(broker: NatsConnection, baggage?: Baggage, cache?: CacheSettings) {
    super({ broker, serviceName: name, baggage, cache, events });
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
