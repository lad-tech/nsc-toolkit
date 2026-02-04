import { related, kv } from '../../../src/injector';
import { methods } from '../service.schema.json';
import { BaseMethod } from '../../../src/Method';
import type { GetSetRequest, GetSetResponse } from '../interfaces';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Кеш в одном сервисе: get/set с версией и опциональным чтением по revision.
 * TTL и глубина истории задаются в схеме (kvBuckets.cache.ttl, history).
 */
@related
export class GetSet extends BaseMethod {
  static settings = methods.GetSet;

  @kv('cache')
  declare cache: import('nats').KV;

  public async handler(request: GetSetRequest): Promise<GetSetResponse> {
    const { key, value, revision: revisionReq } = request;

    if (value !== undefined) {
      const revision = await this.cache.put(key, encoder.encode(value));
      return { key, value, revision };
    }

    // Чтение: последняя версия или конкретная (revision в запросе)
    const entry = revisionReq !== undefined
      ? await this.cache.get(key, { revision: revisionReq })
      : await this.cache.get(key);
    return {
      key,
      value: entry?.value ? decoder.decode(entry.value) : undefined,
      revision: entry?.revision,
    };
  }
}
