import { JetStreamClient, JsMsg, QueuedIterator } from 'nats';

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

  public fetch(noWait?: boolean, size?: number, expires?: number): QueuedIterator<JsMsg> {
    return this.jsClient.fetch(this.streamName, this.consumerName, {
      batch: size ?? this.options.batchSize,
      expires: expires ?? this.options.batchTimeout,
      no_wait: noWait ?? this.options.noWait,
    });
  }
}
