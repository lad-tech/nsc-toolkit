/// <reference types="node" />
import { ConsumerOpts, ConsumerOptsBuilder, JetStreamClient, JetStreamPublishOptions, JetStreamPullSubscription, JetStreamSubscription, JsMsg, PubAck, PullOptions } from 'nats';
import { QueuedIterator } from 'nats/lib/nats-base-client/queued_iterator';
import { Views } from 'nats/lib/nats-base-client/types';
import { EventEmitter } from 'stream';
export declare class JetStreamClientBlank implements JetStreamClient {
    private emitter;
    views: Views;
    constructor(emitter: EventEmitter);
    publish(subj: string, data?: Uint8Array, options?: Partial<JetStreamPublishOptions>): Promise<PubAck>;
    pull(stream: string, durable: string, expires?: number): Promise<JsMsg>;
    fetch(stream: string, durable: string, opts?: Partial<PullOptions>): QueuedIterator<JsMsg>;
    pullSubscribe(subject: string, opts: ConsumerOptsBuilder | Partial<ConsumerOpts>): Promise<JetStreamPullSubscription>;
    subscribe(subject: string, opts: ConsumerOptsBuilder | Partial<ConsumerOpts>): Promise<JetStreamSubscription>;
}
