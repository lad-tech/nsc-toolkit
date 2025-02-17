import { StreamAction, StreamManagerParam, GetListenerOptions, GetBatchListenerOptions } from '.';
import { JetStreamManager, RetentionPolicy, StorageType, DiscardPolicy, Nanos, consumerOpts, Subscription } from 'nats';
import { Root } from './Root';
import { StreamBatchMsgFetcher } from './StreamBatchMsgFetcher';
import { isConsumerOptsBuilder } from 'nats/lib/jetstream/types';
import { StreamSingleMsgFetcher } from './StreamSingleMsgFetcher';

export class StreamManager extends Root {
  private readonly STAR_WILDCARD = '*';
  private readonly GREATER_WILDCARD = '>';
  private readonly TWO_WEEKS_IN_SECOND = 1209600;
  private readonly ONE_DAY_IN_SECOND = 86400;
  private readonly CONSUMER_NOT_FOUND = 'consumer not found';

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

  static isPullConsumerOptions(
    setting?: GetListenerOptions | GetBatchListenerOptions,
  ): setting is GetBatchListenerOptions {
    return !!(setting as GetBatchListenerOptions)?.batch;
  }

  static isStreamFetcher(
    consumer?: StreamSingleMsgFetcher | StreamBatchMsgFetcher | Subscription,
  ): consumer is StreamBatchMsgFetcher {
    return !!(consumer as StreamBatchMsgFetcher)?.fetch;
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
  ): Promise<StreamSingleMsgFetcher>;
  public async createConsumer(
    serviceNameFrom: string,
    eventName: string,
    setting?: GetBatchListenerOptions,
  ): Promise<StreamBatchMsgFetcher>;
  public async createConsumer(
    serviceNameFrom: string,
    eventName: string,
    setting?: GetListenerOptions | GetBatchListenerOptions,
  ): Promise<StreamSingleMsgFetcher | StreamBatchMsgFetcher> {
    const consumerName = this.capitalizeFirstLetter(serviceNameFrom) + this.capitalizeFirstLetter(eventName);
    const prefix = this.param.options.prefix;
    const subject = `${this.param.serviceName}.${prefix}.${eventName}.*`;

    if (!this.jsm) {
      this.jsm = await this.param.broker.jetstreamManager();
    }

    const options = consumerOpts();
    const isPullConsumer = StreamManager.isPullConsumerOptions(setting);

    options
      .durable(consumerName)
      .filterSubject(subject)
      .maxAckPending(setting?.maxPending || 10);

    if (isPullConsumer) {
      if (setting.ackPolicy === 'all') {
        options.manualAck();
        options.ackAll();
      }

      if (setting.ackPolicy === 'none') {
        options.ackNone();
      }

      if (!setting.ackPolicy) {
        options.manualAck();
        options.ackExplicit();
      }

      if (setting.maxPullRequestExpires) {
        options.maxPullRequestExpires(setting.maxPullRequestExpires);
      }

      if (setting.maxPullRequestBatch) {
        options.maxPullBatch(setting.maxPullRequestBatch);
      }
    } else {
      options.manualAck();
      options.ackExplicit();
    }

    if (setting?.maxAckWaiting) {
      options.ackWait(setting.maxAckWaiting);
    }

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

    const streamName = await this.jsm.streams.find(subject);
    if (!streamName) {
      throw new Error(`Error creating consumer ${consumerName}. Stream for subject ${subject} not found`);
    }

    if (isConsumerOptsBuilder(options)) {
      const isConsumerExist = await this.jsm.consumers.info(streamName, consumerName).catch(async error => {
        if (error.message === this.CONSUMER_NOT_FOUND) {
          return false;
        }
        throw error;
      });
      if (!isConsumerExist) {
        await this.jsm.consumers.add(streamName, { ...options.config, filter_subject: subject });
      } else {
        await this.jsm.consumers.update(streamName, consumerName, {
          ...options.config,
          filter_subject: subject,
          deliver_subject: undefined,
        });
      }
    }

    const consumer = await this.broker.jetstream().consumers.get(streamName, consumerName);

    return isPullConsumer
      ? new StreamBatchMsgFetcher(consumer, {
          batchSize: setting.maxPullRequestBatch,
          batchTimeout: setting.maxPullRequestExpires,
        })
      : new StreamSingleMsgFetcher(consumer);
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
