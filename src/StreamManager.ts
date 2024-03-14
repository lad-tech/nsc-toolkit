import { StreamAction, StreamManagerParam, GetListenerOptions } from '.';
import {
  JetStreamManager,
  RetentionPolicy,
  StorageType,
  DiscardPolicy,
  Nanos,
  JetStreamSubscription,
  consumerOpts,
  createInbox,
} from 'nats';
import { Root } from './Root';

export class StreamManager extends Root {
  private readonly STAR_WILDCARD = '*';
  private readonly GREATER_WILDCARD = '>';
  private readonly TWO_WEEKS_IN_SECOND = 1209600;
  private readonly ONE_DAY_IN_SECOND = 86400;

  private readonly defaultStreamOption: Omit<Required<StreamAction>, 'action' | 'maxBytes'> &
    Pick<StreamAction, 'maxBytes'> = {
    storage: 'file',
    retentionPolicy: 'limits',
    discardPolicy: 'old',
    messageTTL: this.TWO_WEEKS_IN_SECOND,
    duplicateTrackingTime: this.ONE_DAY_IN_SECOND,
    replication: 1,
    rollUps: true,
  };

  private jsm?: JetStreamManager;

  constructor(private param: StreamManagerParam) {
    super(param.broker, param.outputFormatter);
  }

  public async createStreams() {
    if (!this.jsm) {
      this.jsm = await this.param.broker.jetstreamManager();
    }

    for await (const { action, ...options } of this.param.options.actions) {
      const streamName = this.getStreamName(action);

      const config = {
        name: streamName,
        subjects: [`${this.param.serviceName}.${this.param.options.prefix}.${action}`],
        retention: (options.retentionPolicy || this.defaultStreamOption.retentionPolicy) as RetentionPolicy,
        storage: (options.storage || this.defaultStreamOption.storage) as StorageType,
        num_replicas: options.replication || this.defaultStreamOption.replication,
        discard: (options.discardPolicy || this.defaultStreamOption.discardPolicy) as DiscardPolicy,
        max_age: this.convertSecondsToNanoseconds(options.messageTTL || this.defaultStreamOption.messageTTL),
        max_bytes: options.maxBytes,
        duplicate_window: this.convertSecondsToNanoseconds(
          options.duplicateTrackingTime || this.defaultStreamOption.duplicateTrackingTime,
        ),
        allow_rollup_hdrs: options.rollUps || this.defaultStreamOption.rollUps,
      };

      const existingStream = await this.jsm.streams.info(streamName).catch(error => {
        if (this.isNotFoundStreamError(error)) {
          return null;
        }
        throw error;
      });
      if (!existingStream) {
        await this.jsm.streams.add(config);
        continue;
      }

      await this.jsm.streams.update(streamName, { ...existingStream.config, ...config });
    }
  }

  public async createConsumer(
    serviceNameFrom: string,
    eventName: string,
    setting?: GetListenerOptions,
  ): Promise<JetStreamSubscription> {
    const consumerName = this.capitalizeFirstLetter(serviceNameFrom) + this.capitalizeFirstLetter(eventName);

    const prefix = this.param.options.prefix;
    const subjeсt = `${this.param.serviceName}.${prefix}.${eventName}`;

    const options = consumerOpts();

    options
      .durable(consumerName)
      .manualAck()
      .ackExplicit()
      .maxAckPending(setting?.maxPending || 10)
      .deliverTo(createInbox());

    if (setting?.queue) {
      options.queue(setting.queue);
    }

    if (setting?.deliver) {
      if (setting.deliver === 'new') {
        options.deliverNew();
      }
      if (setting.deliver === 'all') {
        options.deliverAll();
      }
    }

    return this.broker.jetstream().subscribe(subjeсt, options);
  }

  private getStreamName(eventName: string) {
    const serviceName = this.capitalizeFirstLetter(this.param.serviceName);
    const prefix = this.buildPrefixForStreamName(this.param.options.prefix);

    let streamName = `${serviceName}${prefix}`;

    if (eventName !== this.STAR_WILDCARD && eventName !== this.GREATER_WILDCARD) {
      streamName += this.capitalizeFirstLetter(eventName);
    }

    return streamName;
  }

  private isNotFoundStreamError(error: unknown) {
    const ERROR_TYPE = 'NatsError';
    const ERROR_NOT_FOUND_STREAM = 'stream not found';
    if (error instanceof Error) {
      return error.name === ERROR_TYPE && error.message === ERROR_NOT_FOUND_STREAM;
    }
    return false;
  }

  private buildPrefixForStreamName(prefix: string) {
    return prefix.split(this.SUBJECT_DELIMITER).map(this.capitalizeFirstLetter).join();
  }

  private capitalizeFirstLetter(word: string) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  private convertSecondsToNanoseconds(seconds: number): Nanos {
    return seconds * 1_000_000_000;
  }
}
