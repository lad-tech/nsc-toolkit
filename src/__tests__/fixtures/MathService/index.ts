import { NatsConnection } from 'nats';
import { Readable } from 'stream';
import { Client, CacheSettings, Baggage } from '../../..';
import { name, methods, events } from './math.service.json';
import {
  EmitterMathExternal,
  SumRequest,
  SumResponse,
  SumStreamResponse,
  FibonacciRequest,
} from '../../../../examples/MathService/interfaces';

export class MathClient extends Client<EmitterMathExternal> {
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
  public async multiply(payload: Readable) {
    return this.request<Readable>(`${name}.${methods.Multiply.action}`, payload, methods.Multiply);
  }
}
