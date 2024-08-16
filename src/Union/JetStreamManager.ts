import { Advisory, JetStreamAccountStats, JetStreamClient, JetStreamManager, JetStreamOptions } from 'nats';
import { StreamApiBlank } from './StreamApi';
import { ConsumerApiBlank } from './ConsumerApi';

export class JetStreamManagerBlank implements JetStreamManager {
  getOptions(): JetStreamOptions {
    throw new Error('Method not implemented.');
  }
  jetstream(): JetStreamClient {
    throw new Error('Method not implemented.');
  }
  consumers = new ConsumerApiBlank();
  streams = new StreamApiBlank();
  getAccountInfo(): Promise<JetStreamAccountStats> {
    throw new Error('Method getAccountInfo not implemented.');
  }
  advisories(): AsyncIterable<Advisory> {
    throw new Error('Method advisories not implemented.');
  }
}

export const jetStreamManagerBlank = new JetStreamManagerBlank();
