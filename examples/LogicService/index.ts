import { Client } from '../../src/Client';
import { NatsConnection } from 'nats';
import { WeirdSumRequest, WeirdSumResponse } from './interfaces';
import { Baggage, CacheSettings } from '../../src/interfaces';
import { name, methods } from './service.json';
export * from './interfaces';

export default class ServiceMathClient extends Client {
  constructor(broker: NatsConnection, baggage?: Baggage, cache?: CacheSettings) {
    super({ broker, serviceName: name, baggage });
  }

  public async weirdSum(payload: WeirdSumRequest) {
    return this.request<WeirdSumResponse>(`${name}.${methods.WeirdSum.action}`, payload, methods.WeirdSum);
  }
}
