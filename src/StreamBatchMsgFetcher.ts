import { Consumer, ConsumerMessages } from 'nats';

interface BatcherOptions {
  batchSize?: number;
  batchTimeout?: number;
  noWait?: boolean;
}
export class StreamBatchMsgFetcher {
  constructor(private consumer: Consumer, private options: BatcherOptions) {}

  public async fetch(size?: number, expires?: number): Promise<ConsumerMessages> {
    return await this.consumer.fetch({
      max_messages: size ?? this.options.batchSize,
      expires: expires ?? this.options.batchTimeout,
    });
  }
}
