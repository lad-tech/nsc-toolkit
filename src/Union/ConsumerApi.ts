import { ConsumerAPI, ConsumerConfig, ConsumerInfo, ConsumerUpdateConfig, Lister } from 'nats';

export class ConsumerApiBlank implements ConsumerAPI {
  info(stream: string, consumer: string): Promise<ConsumerInfo> {
    throw new Error('Method not implemented.');
  }
  add(stream: string, cfg: Partial<ConsumerConfig>): Promise<ConsumerInfo> {
    return Promise.resolve({} as any);
  }
  update(stream: string, durable: string, cfg: Partial<ConsumerUpdateConfig>): Promise<ConsumerInfo> {
    throw new Error('Method not implemented.');
  }
  delete(stream: string, consumer: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  list(stream: string): Lister<ConsumerInfo> {
    throw new Error('Method not implemented.');
  }
  pause(
    stream: string,
    name: string,
    until?: Date | undefined,
  ): Promise<{ paused: boolean; pause_until?: string | undefined }> {
    throw new Error('Method not implemented.');
  }
  resume(stream: string, name: string): Promise<{ paused: boolean; pause_until?: string | undefined }> {
    throw new Error('Method not implemented.');
  }
}
