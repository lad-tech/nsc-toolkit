import {
  ConsumerOpts,
  ConsumerOptsBuilder,
  JetStreamClient,
  JetStreamPublishOptions,
  JetStreamPullSubscription,
  JetStreamSubscription,
  JsMsg,
  PubAck,
  PullOptions,
} from 'nats';
import { QueuedIterator } from 'nats/lib/nats-base-client/queued_iterator';
import { Views } from 'nats/lib/nats-base-client/types';
import { EventEmitter } from 'stream';
import { UnionSubscription } from './Subscription';

export class JetStreamClientBlank implements JetStreamClient {
  views: Views;

  constructor(private emitter: EventEmitter) {}

  publish(subj: string, data?: Uint8Array, options?: Partial<JetStreamPublishOptions>): Promise<PubAck> {
    throw new Error('Method publish not implemented.');
  }
  pull(stream: string, durable: string, expires?: number): Promise<JsMsg> {
    throw new Error('Method pull not implemented.');
  }
  fetch(stream: string, durable: string, opts?: Partial<PullOptions>): QueuedIterator<JsMsg> {
    throw new Error('Method fetch not implemented.');
  }
  pullSubscribe(
    subject: string,
    opts: ConsumerOptsBuilder | Partial<ConsumerOpts>,
  ): Promise<JetStreamPullSubscription> {
    throw new Error('Method pullSubscribe not implemented.');
  }
  subscribe(subject: string, opts: ConsumerOptsBuilder | Partial<ConsumerOpts>): Promise<JetStreamSubscription> {
    const subscription = new UnionSubscription({ objectMode: true });
    const listener = ({ data }: any) => {
      subscription.write({ data, ack: () => Promise.resolve(), nak: () => Promise.resolve() });
    };
    this.emitter.on(subject, listener);

    subscription.on('close', () => {
      this.emitter.off(subject, listener);
    });

    return Promise.resolve(subscription);
  }
}
