import { JetStreamAccountStats, JetStreamManager } from 'nats';
import { ConsumerAPI, Advisory } from 'nats/lib/nats-base-client/types';
import { StreamApiBlank } from './StreamApi';
export declare class JetStreamManagerBlank implements JetStreamManager {
    consumers: ConsumerAPI;
    streams: StreamApiBlank;
    getAccountInfo(): Promise<JetStreamAccountStats>;
    advisories(): AsyncIterable<Advisory>;
}
export declare const jetStreamManagerBlank: JetStreamManagerBlank;
