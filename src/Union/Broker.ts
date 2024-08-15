import {
  JetStreamClient,
  JetStreamManager,
  JetStreamOptions,
  Msg,
  NatsConnection,
  Payload,
  PublishOptions,
  RequestManyOptions,
  RequestOptions,
  ServerInfo,
  ServicesAPI,
  Stats,
  Status,
  Subscription,
  SubscriptionOptions,
} from 'nats';
import { EventEmitter } from 'node:stream';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { UnionSubscription } from './Subscription';
import { jetStreamManagerBlank } from './JetStreamManager';
import { JetStreamClientBlank } from './JetStreamClient';

interface Union {
  isUnion?: boolean;
}

export type Broker = NatsConnection & Union;

export class UnionBroker implements Broker {
  publishMessage(msg: Msg): void {
    throw new Error('Method not implemented.');
  }
  respondMessage(msg: Msg): boolean {
    throw new Error('Method not implemented.');
  }
  requestMany(subject: string, payload?: Payload | undefined, opts?: Partial<RequestManyOptions> | undefined): Promise<AsyncIterable<Msg>> {
    throw new Error('Method not implemented.');
  }
  services: ServicesAPI;
  reconnect(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  info?: ServerInfo;

  public isUnion = true;
  private DEFAULT_TIMEOUT = 60_000; // 1 Minut
  private emitter = new EventEmitter();

  closed(): Promise<void | Error> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }

  publish(subject: string, data?: Uint8Array, options?: PublishOptions): void {
    this.emitter.emit(subject, { data });
  }
  subscribe(subject: string, opts?: SubscriptionOptions): Subscription {
    const subscription = new UnionSubscription({ objectMode: true });
    const listener = (message: { data: unknown; respond: (response: unknown) => void }, uniqResponseKey?: string) => {
      
      if (uniqResponseKey) {
        message['respond'] = (data: unknown) => this.emitter.emit(uniqResponseKey, { data });
      }

      subscription.write(message);
    };
    this.emitter.on(subject, listener);

    subscription.on('close', () => {
      this.emitter.off(subject, listener);
    });

    return subscription;
  }
  request(subject: string, data?: Uint8Array, opts?: RequestOptions): Promise<Msg> {
    const uniqResponseKey = randomUUID();
    const timeout = opts?.timeout || this.DEFAULT_TIMEOUT;
    this.emitter.emit(subject, { data }, uniqResponseKey);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(reject, timeout);

      this.emitter.once(uniqResponseKey, response => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
  drain(): Promise<void> {
    return Promise.resolve();
  }
  isClosed(): boolean {
    throw new Error('Method isClosed not implemented.');
  }
  isDraining(): boolean {
    throw new Error('Method isDraining not implemented.');
  }
  getServer(): string {
    throw new Error('Method getServer not implemented.');
  }
  status(): AsyncIterable<Status> {
    return new PassThrough();
  }
  stats(): Stats {
    throw new Error('Method stats not implemented.');
  }
  jetstreamManager(opts?: JetStreamOptions): Promise<JetStreamManager> {
    return Promise.resolve(jetStreamManagerBlank);
  }
  jetstream(opts?: JetStreamOptions): JetStreamClient {
    return new JetStreamClientBlank(this.emitter);
  }
  rtt(): Promise<number> {
    throw new Error('Method rtt not implemented.');
  }
}
