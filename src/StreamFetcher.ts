import { ConsumerMessages, JetStreamClient } from 'nats';

interface BatcherOptions {
  batchSize?: number;
  batchTimeout?: number;
  noWait?: boolean;
}
export class StreamFetcher {
  constructor(
    private jsClient: JetStreamClient,
    private streamName: string,
    private consumerName: string,
    private options: BatcherOptions,
  ) {}

  public async fetch(size?: number, expires?: number): Promise<ConsumerMessages> {
    const consumer = await this.jsClient.consumers.get(this.streamName, this.consumerName);
    return await consumer.fetch({
      max_messages: size ?? this.options.batchSize,
      expires: expires ?? this.options.batchTimeout,
    });
  }
}
