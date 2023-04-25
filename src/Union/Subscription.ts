import { Msg, NatsError, Subscription } from 'nats';
import { Closed, ConsumerInfoable, Destroyable } from 'nats/lib/nats-base-client/types';
import { PassThrough } from 'node:stream';

export class UnionSubscription extends PassThrough implements Subscription, Destroyable, Closed, ConsumerInfoable {
  closed: Promise<void>;
  unsubscribe(max?: number): void {
    this.destroy()
  }
  drain(): Promise<void> {
    throw new Error('Method drain not implemented.');
  }
  isDraining(): boolean {
    throw new Error('Method isDraining not implemented.');
  }
  isClosed(): boolean {
    throw new Error('Method isClosed not implemented.');
  }
  callback(err: NatsError | null, msg: Msg): void {
    throw new Error('Method callback not implemented.');
  }
  getSubject(): string {
    throw new Error('Method getSubject not implemented.');
  }
  getReceived(): number {
    throw new Error('Method getReceived not implemented.');
  }
  getProcessed(): number {
    throw new Error('Method getProcessed not implemented.');
  }
  getPending(): number {
    throw new Error('Method getPending not implemented.');
  }
  getID(): number {
    throw new Error('Method getID not implemented.');
  }
  getMax(): number | undefined {
    throw new Error('Method getMax not implemented.');
  }
  destroy(error?: Error | undefined): any {
    throw new Error('Method destroy not implemented.');
  }
  consumerInfo(): Promise<any> {
    throw new Error('Method consumerInfo not implemented.');
  }
}
