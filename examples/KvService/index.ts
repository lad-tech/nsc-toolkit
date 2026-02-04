import type { NatsConnection } from 'nats';
import { Client } from '../../src/Client';
import type { Baggage, CacheSettings } from '../../src/interfaces';
import type { GetSetRequest, GetSetResponse } from './interfaces';
import { methods, name, kvBuckets } from './service.schema.json';

/** Клиент сервиса Kv: при наличии kvBuckets в схеме передаём их в конструктор */
export default class KvServiceClient extends Client {
  constructor(broker: NatsConnection, baggage?: Baggage, cache?: CacheSettings) {
    super({ broker, serviceName: name, baggage, cache, kvBuckets });
  }

  public async getset(payload: GetSetRequest) {
    return this.request<GetSetResponse>(
      `${name}.${methods.GetSet.action}`,
      payload as unknown as Record<string, unknown>,
      methods.GetSet,
    );
  }
}
