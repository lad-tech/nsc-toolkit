import { JetStreamClient, JetStreamManager, JetStreamOptions, Msg, NatsConnection, PublishOptions, RequestOptions, ServerInfo, Stats, Status, Subscription, SubscriptionOptions } from 'nats';
interface Union {
    isUnion?: boolean;
}
export type Broker = NatsConnection & Union;
export declare class UnionBroker implements Broker {
    info?: ServerInfo;
    isUnion: boolean;
    private DEFAULT_TIMEOUT;
    private emitter;
    closed(): Promise<void | Error>;
    close(): Promise<void>;
    publish(subject: string, data?: Uint8Array, options?: PublishOptions): void;
    subscribe(subject: string, opts?: SubscriptionOptions): Subscription;
    request(subject: string, data?: Uint8Array, opts?: RequestOptions): Promise<Msg>;
    flush(): Promise<void>;
    drain(): Promise<void>;
    isClosed(): boolean;
    isDraining(): boolean;
    getServer(): string;
    status(): AsyncIterable<Status>;
    stats(): Stats;
    jetstreamManager(opts?: JetStreamOptions): Promise<JetStreamManager>;
    jetstream(opts?: JetStreamOptions): JetStreamClient;
    rtt(): Promise<number>;
}
export {};
