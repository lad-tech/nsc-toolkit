import type { KV, KvOptions } from 'nats';
import { StorageType } from 'nats';
import type { KvBucketOptions, KvManagerParam } from './interfaces';
import { Root } from './Root';

/**
 * Менеджер KV-бакетов JetStream: создаёт или привязывается к бакетам по конфигу из схемы.
 * По аналогии с StreamManager — вызывается из Service.start() при наличии options.kvBuckets.
 */
export class KvManager extends Root {
  constructor(private param: KvManagerParam) {
    super(param.broker, param.outputFormatter);
  }

  /**
   * Создаёт или привязывается к каждому бакету из конфига.
   * views.kv(name, opts) в nats выполняет get-or-create.
   * @returns Map: имя бакета → экземпляр KV
   */
  async createBuckets(): Promise<Map<string, KV>> {
    const js = await this.param.broker.jetstream();
    const result = new Map<string, KV>();

    for (const [bucketName, options] of Object.entries(this.param.kvBuckets)) {
      const opts = this.toNatsKvOptions(options);
      const kv = await js.views.kv(bucketName, opts);
      result.set(bucketName, kv);
    }

    return result;
  }

  /**
   * Преобразует опции из схемы (KvBucketOptions) в формат nats KvOptions.
   * ttl в схеме — в секундах, в nats — в миллисекундах.
   */
  private toNatsKvOptions(options: KvBucketOptions): Partial<KvOptions> {
    const out: Partial<KvOptions> = {};
    if (options.history !== undefined) out.history = options.history;
    if (options.ttl !== undefined) out.ttl = options.ttl * 1000;
    if (options.max_bytes !== undefined) out.max_bytes = options.max_bytes;
    if (options.max_value_size !== undefined) out.maxValueSize = options.max_value_size;
    if (options.storage !== undefined) {
      out.storage = options.storage === 'memory' ? StorageType.Memory : StorageType.File;
    }
    return out;
  }
}
