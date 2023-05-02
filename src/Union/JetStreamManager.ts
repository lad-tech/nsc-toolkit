import { JetStreamAccountStats, JetStreamManager } from 'nats';
import { ConsumerAPI, Advisory } from 'nats/lib/nats-base-client/types';
import { StreamApiBlank } from './StreamApi';

export class JetStreamManagerBlank implements JetStreamManager {
  consumers: ConsumerAPI;
  streams = new StreamApiBlank();
  getAccountInfo(): Promise<JetStreamAccountStats> {
    throw new Error('Method getAccountInfo not implemented.');
  }
  advisories(): AsyncIterable<Advisory> {
    throw new Error('Method advisories not implemented.');
  }
}

export const jetStreamManagerBlank = new JetStreamManagerBlank();
