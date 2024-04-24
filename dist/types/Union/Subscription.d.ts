/// <reference types="node" />
import { Msg, NatsError, Subscription } from 'nats';
import { Closed, ConsumerInfoable, Destroyable } from 'nats/lib/nats-base-client/types';
import { PassThrough } from 'node:stream';
export declare class UnionSubscription extends PassThrough implements Subscription, Destroyable, Closed, ConsumerInfoable {
    closed: Promise<void>;
    unsubscribe(max?: number): void;
    drain(): Promise<void>;
    isDraining(): boolean;
    isClosed(): boolean;
    callback(err: NatsError | null, msg: Msg): void;
    getSubject(): string;
    getReceived(): number;
    getProcessed(): number;
    getPending(): number;
    getID(): number;
    getMax(): number | undefined;
    destroy(error?: Error | undefined): any;
    consumerInfo(): Promise<any>;
}
