import * as opentelemetry from '@opentelemetry/api';
import Ajv from 'ajv';
import { JsMsg, JSONCodec, Msg, Subscription, StringCodec, MsgHdrs } from 'nats';
import { createHash } from 'node:crypto';
import * as http from 'node:http';
import { EventEmitter, Readable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import { CacheSettings } from '.';
import {
  Baggage,
  ClientParam,
  Emitter,
  EmitterStreamEvent,
  Events,
  GetBatchListenerOptions,
  GetListenerOptions,
  HttpSettings,
  Listener,
  ListenerBatch,
  Message,
  MethodOptions,
  MethodSettings,
} from './interfaces';
import { Root } from './Root';
import { StreamManager } from './StreamManager';
import { StreamBatchMsgFetcher } from './StreamBatchMsgFetcher';
import { StreamSingleMsgFetcher } from './StreamSingleMsgFetcher';
import { Meter } from './Meter';

type RequestData = Record<string, unknown> | Readable;
export class Client<E extends Emitter = Emitter> extends Root {
  private serviceName: string;
  private baggage?: Baggage;
  private cache?: CacheSettings;
  private events?: Events<E>;
  private Ref?: object;

  private subscriptions = new Map<keyof E, Subscription | StreamSingleMsgFetcher>();
  private REQUEST_HTTP_SETTINGS_TIMEOUT = 1000; // ms

  constructor({ broker, events, loggerOutputFormatter, serviceName, baggage, cache, Ref }: ClientParam<E>) {
    super(broker, loggerOutputFormatter);
    this.logger.setLocation(serviceName);
    this.serviceName = serviceName;
    this.baggage = baggage;
    this.cache = cache;
    this.events = events;
    this.Ref = Ref;
  }

  private async startWatch(
    subscription: Subscription | StreamSingleMsgFetcher,
    listener: EventEmitter,
    eventName: string,
  ) {
    for await (const event of subscription) {
      if (!event) {
        continue;
      }
      let data: unknown;
      try {
        data = JSONCodec<unknown>().decode(event.data);
      } catch (error) {
        data = StringCodec().decode(event.data);
      }
      const message: Partial<EmitterStreamEvent<any>> = { data };

      let baggage: Baggage | undefined;
      if (event.headers) {
        baggage = this.getBaggageFromNATSHeader(event.headers);
      }

      message.meter = new Meter(eventName, baggage);

      if (this.isJsMessage(event)) {
        message.ack = event.ack.bind(event);
        message.nak = event.nak.bind(event);
      }

      listener.emit(eventName, message);
    }
  }

  private async startBatchWatch(fetcher: StreamBatchMsgFetcher, listener: EventEmitter, eventName: string) {
    while (true) {
      const batch: Partial<EmitterStreamEvent<any>>[] = [];
      const baggages: Baggage[] = [];

      const events = await fetcher.fetch();

      for await (const event of events) {
        let data: unknown;
        try {
          data = JSONCodec<unknown>().decode(event.data);
        } catch (error) {
          data = StringCodec().decode(event.data);
        }
        const message: Partial<EmitterStreamEvent<any>> = { data };
        message.ack = event.ack.bind(event);
        message.nak = event.nak.bind(event);

        batch.push(message);

        let baggage: Baggage | undefined;
        if (event.headers) {
          baggage = this.getBaggageFromNATSHeader(event.headers);
          if (baggage) {
            baggages.push(baggage);
          }
        }

        message.meter = new Meter(eventName, baggage);
      }

      if (batch.length > 0) {
        const meter = new Meter(eventName, undefined, baggages);
        listener.emit(eventName, batch, meter);
      }
    }
  }

  /**
   * Make listener for service events. Auto subscribe and unsubscribe to subject
   */
  public getListener<A extends keyof E>(serviceNameFrom: string, options?: GetListenerOptions): Listener<E>;
  public getListener<A extends keyof E>(serviceNameFrom: string, options?: GetBatchListenerOptions): ListenerBatch<E>;
  public getListener<A extends keyof E>(
    serviceNameFrom: string,
    options?: GetListenerOptions | GetBatchListenerOptions,
  ): Listener<E> | ListenerBatch<E> {
    if (!this.events) {
      throw new Error('The service does not generate events');
    }

    const listener = new EventEmitter();

    return new Proxy(listener, {
      get: (target, prop, receiver) => {
        const method = Reflect.get(target, prop, receiver);

        if (prop === 'on') {
          return async (eventName: A, handler: (param: unknown) => void) => {
            try {
              this.logger.info('Subscribe', eventName);

              const action = this.events?.list[eventName];

              if (!action) {
                throw new Error(`The service does not generate ${String(eventName)} event`);
              }

              const isStream = action.options?.stream;

              let subscription: Subscription | StreamSingleMsgFetcher | StreamBatchMsgFetcher;

              if (isStream) {
                subscription = await new StreamManager({
                  broker: this.broker,
                  options: this.events!.streamOptions,
                  serviceName: this.serviceName,
                }).createConsumer(serviceNameFrom, String(eventName), options);
              } else {
                const queue = options?.queue ? { queue: options.queue } : {};
                subscription = this.broker.subscribe(`${this.serviceName}.${eventName as string}`, queue);
              }

              this.subscriptions.set(eventName, subscription);
              if (StreamManager.isStreamFetcher(subscription) && StreamManager.isPullConsumerOptions(options)) {
                this.startBatchWatch(subscription, listener, String(eventName));
              } else {
                this.startWatch(subscription, listener, String(eventName));
              }

              return method.call(target, eventName, handler);
            } catch (error) {
              const errorMessage = 'Failed subscribe to subject';
              this.logger.error(errorMessage, error);
              throw new Error(`${errorMessage} ${this.serviceName}.${String(eventName)}`);
            }
          };
        }

        if (prop === 'off') {
          return (eventName: A, listener: (params: unknown) => void) => {
            this.logger.info('Unsubscribe', eventName);
            const subscription = this.subscriptions.get(eventName);
            subscription?.unsubscribe();
            this.subscriptions.delete(eventName);
            return method.call(target, eventName, listener);
          };
        }
        return method;
      },
    }) as Listener<E>;
  }

  private createCacheKey(subject: string, data: Record<string, unknown>) {
    const dataHash = createHash('sha1').update(JSON.stringify(data)).digest('hex');
    return `${this.CACHE_SERVICE_KEY}:${subject}:${dataHash}`;
  }

  private validate(data: any, schema: Record<string, unknown>) {
    const ajv = new Ajv();
    if (this.Ref) {
      ajv.addSchema(this.Ref);
    }

    const requestValidator = ajv.compile(schema);
    const valid = requestValidator(data);
    if (!valid) {
      throw new Error(JSON.stringify(requestValidator.errors));
    }
  }

  protected async request<R = any, P extends RequestData = RequestData>(
    subject: string,
    data: P,
    { options, request, response }: MethodSettings,
  ): Promise<R> {
    const tracer = opentelemetry.trace.getTracer('');
    const span = tracer.startSpan(subject, undefined, this.getContext(this.baggage));
    try {
      if (options?.runTimeValidation?.request && request) {
        this.validate(data, request);
      }

      const { spanId, traceId, traceFlags } = span.spanContext();
      const expired = this.getExpired(this.baggage?.expired, options?.timeout);
      const requestId = this.baggage?.requestId;
      const message: Message = { payload: data, baggage: { expired, traceId, spanId, traceFlags, requestId } };
      const timeout = expired - Date.now();

      if (timeout <= 0) {
        throw new Error('Timeout request service ' + subject);
      }

      let key = '';

      if (options?.cache && !this.isStream(data) && this.cache) {
        try {
          key = this.createCacheKey(subject, data);
          const result = await Promise.race<any>([this.cache.service.get(key), setTimeout(this.cache.timeout, null)]);
          if (result) {
            return JSON.parse(result);
          }
        } catch (error) {
          this.logger.warn('get cache: ', error);
        }
      }
      const result = options?.useStream
        ? await this.makeHttpRequest(subject, message, options, timeout)
        : await this.makeBrokerRequest(subject, message, timeout);

      if (result.error) {
        throw new Error(result.error.message ?? result.error);
      }

      if (options?.runTimeValidation?.response && response) {
        this.validate(result.payload, response);
      }
      if (options?.cache && !this.isStream(result.payload) && this.cache) {
        this.cache.service.set(key, JSON.stringify(result.payload), options.cache);
      }

      return result.payload;
    } catch (error) {
      span.setAttribute('error', true);
      span.setAttribute('error.kind', error);
      this.logger.error(error);
      throw error;
    } finally {
      span.end();
    }
  }

  private async getHTTPSettingsFromRemoteService() {
    const subject = `${this.serviceName}.${this.SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS}`;
    const result = await this.broker.request(subject, Buffer.from(JSON.stringify('')), {
      timeout: this.REQUEST_HTTP_SETTINGS_TIMEOUT,
    });
    const { ip, port } = JSONCodec<HttpSettings>().decode(result.data);
    if (!ip || !port) {
      throw new Error(`Remote service ${this.serviceName} did not return http settings`);
    }
    return { ip, port };
  }

  private isStream(data: unknown | Readable): data is Readable {
    return data instanceof Readable;
  }

  private async makeBrokerRequest(subject: string, message: Message, timeout: number) {
    try {
      const result = await this.broker.request(subject, Buffer.from(JSON.stringify(message)), { timeout });
      return JSONCodec<Message<any>>().decode(result.data);
    } catch (error) {
      const errorMessage = new Error(`${error?.message}. Subject: ${subject} `);
      return this.buildErrorMessage(errorMessage);
    }
  }

  private async makeHttpRequest(
    subject: string,
    message: Message | Message<Readable>,
    options: MethodOptions,
    timeout: number,
  ): Promise<Message<any>> {
    return new Promise(async resolve => {
      const { ip, port } = await this.getHTTPSettingsFromRemoteService();
      const serviceActionPath = subject.split('.');
      const headersFromBaggage = this.convertBaggaggeToExternalHeader(message.baggage);

      const headers = {
        'Content-Type': this.isStream(message.payload) ? 'application/octet-stream' : 'application/json',
        ...headersFromBaggage,
      };
      if (!this.isStream(message.payload)) {
        headers['Content-Length'] = Buffer.byteLength(JSON.stringify(message.payload));
      }
      const request = http.request(
        {
          host: ip,
          port,
          path: `/${serviceActionPath.join('/')}`,
          method: 'POST',
          headers,
          timeout,
        },
        async response => {
          if (options?.useStream?.response && response.statusCode !== 500) {
            resolve({ payload: response });
            return;
          }

          const data: Buffer[] = [];
          for await (const chunk of response) {
            data.push(chunk);
          }

          const responseDataString = Buffer.concat(data).toString();
          try {
            resolve(JSON.parse(responseDataString));
          } catch (error) {
            const errorMessage = new Error(`${error?.message}. Subject: ${subject} `);
            resolve(this.buildErrorMessage(errorMessage));
          }
        },
      );

      request.on('error', error => {
        const errorMessage = new Error(`${error?.message}. Subject: ${subject} `);
        resolve(this.buildErrorMessage(errorMessage));
      });

      if (this.isStream(message.payload)) {
        message.payload.pipe(request);
        return;
      }

      request.write(JSON.stringify(message.payload));
      request.end();
    });
  }

  private isJsMessage(message: JsMsg | Msg): message is JsMsg {
    return !!(message as JsMsg).ack && !!(message as JsMsg).nak;
  }

  private getBaggageFromNATSHeader(headers: MsgHdrs): Baggage | undefined {
    const traceId = headers.get('nsc-trace-id');
    const spanId = headers.get('nsc-span-id');
    const traceFlags = headers.has('nsc-trace-flags') ? +headers.get('nsc-trace-flags') : undefined;
    const requestId = headers.has('x-request-id') ? String(headers.get('x-request-id')) : undefined;

    if (traceId && spanId && traceFlags) {
      return {
        traceId,
        spanId,
        traceFlags,
        requestId,
      };
    }
  }
}
