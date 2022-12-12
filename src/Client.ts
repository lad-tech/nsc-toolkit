import type { Logs } from '@lad-tech/toolbelt';
import * as opentelemetry from '@opentelemetry/api';
import Ajv from 'ajv';
import { createHash } from 'crypto';
import * as http from 'http';
import { JSONCodec, NatsConnection, Subscription } from 'nats';
import { EventEmitter, Readable } from 'stream';
import { setTimeout } from 'timers/promises';
import {
  Baggage,
  CacheSettings,
  Emitter,
  ExternalBaggage,
  HttpSettings,
  Listener,
  Message,
  MethodOptions,
  MethodSettings,
} from './interfaces';
import { Root } from './Root';

type RequestData = Record<string, unknown> | Readable;
export class Client<E extends Emitter = {}> extends Root {
  private subscriptions = new Map<keyof E, Subscription>();
  private REQUEST_HTTP_SETTINGS_TIMEOUT = 1000; // ms

  constructor(
    natsConnection: NatsConnection,
    private serviceName: string,
    private baggage?: Baggage,
    private cache?: CacheSettings,
    loggerOutputFormatter?: Logs.OutputFormatter,
  ) {
    super(natsConnection, loggerOutputFormatter);
    this.logger.setLocation(serviceName);
  }

  /**
   * Make listener for service events. Auto subscribe and unsubscribe to subject
   */
  public getListener<A extends keyof E>(eventNames: Array<A>, queue?: string): Listener<E> {
    const listener = new EventEmitter();
    eventNames.forEach(async eventName => {
      const subscription = this.brocker.subscribe(`${this.serviceName}.${eventName as string}`, { queue });
      this.subscriptions.set(eventName, subscription);
      for await (const event of subscription) {
        const data = JSONCodec<unknown>().decode(event.data);
        listener.emit(`${eventName as string}`, data);
      }
    });
    return new Proxy(listener, {
      get: (target, prop, receiver) => {
        const method = Reflect.get(target, prop, receiver);
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
    const requestValidator = new Ajv().compile(schema);
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
      const message: Message = { payload: data, baggage: { expired, traceId, spanId, traceFlags } };
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
        throw new Error(result.error.message);
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
    const result = await this.brocker.request(subject, Buffer.from(JSON.stringify('')), {
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
      const result = await this.brocker.request(subject, Buffer.from(JSON.stringify(message)), { timeout });
      return JSONCodec<Message<any>>().decode(result.data);
    } catch (error) {
      return this.buildErrorMessage(error);
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
          if (options?.useStream?.response) {
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
            resolve(this.buildErrorMessage(error));
          }
        },
      );

      request.on('error', error => {
        resolve(this.buildErrorMessage(error));
      });

      if (this.isStream(message.payload)) {
        message.payload.pipe(request);
        return;
      }

      request.write(JSON.stringify(message.payload));
      request.end();
    });
  }

  private convertBaggaggeToExternalHeader(baggage?: Baggage): ExternalBaggage {
    if (!baggage) {
      return {};
    }
    return {
      'nsc-expired': baggage.expired,
      'nsc-trace-id': baggage.traceId,
      'nsc-span-id': baggage.spanId,
      'nsc-trace-flags': baggage.traceFlags,
    };
  }
}
