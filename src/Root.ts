import { Logs } from '@lad-tech/toolbelt';
import * as opentelemetry from '@opentelemetry/api';
import type { NatsConnection } from 'nats';
import { TagKey, type Baggage, type ExternalBaggage, type Tag } from './interfaces';
import { UnionBroker, Broker } from './Union';

export class Root {
  protected readonly SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS = 'get_http_settings';
  protected readonly CACHE_SERVICE_KEY = 'CACHE';
  protected readonly SUBJECT_DELIMITER = '.';
  protected logger: Logs.Logger;
  public broker: Broker;

  constructor(broker?: NatsConnection, outputFormatter?: Logs.OutputFormatter) {
    if (!broker) {
      this.broker = new UnionBroker();
    } else {
      this.broker = broker;
    }
    this.logger = new Logs.Logger({ outputFormatter });
  }

  protected castToNumber(value?: string) {
    const result = +value!;
    if (isNaN(result)) {
      throw new Error(`Невозможно привести значение ${value} к числу`);
    }
    return result;
  }

  protected getSettingFromEnv(name: string, required = true) {
    const value = process.env[name];
    if (!value && required) {
      throw new Error(`Не установлена обязательная настройка: ${name}`);
    }
    return value;
  }

  /**
   * Make opentelemetry context from baggagge
   */
  protected getContext(baggage?: Baggage) {
    if (baggage) {
      return opentelemetry.trace.setSpanContext(opentelemetry.context.active(), baggage);
    }
  }

  protected getExpired(expired?: number, ownTimeout?: number) {
    try {
      if (!expired && !ownTimeout) {
        const timeout = this.castToNumber(this.getSettingFromEnv('DEFAULT_RESPONSE_TIMEOUT'));
        return Date.now() + timeout;
      }
      if (ownTimeout) {
        return Date.now() + ownTimeout;
      }

      return expired!;
    } catch (error) {
      this.logger.error(error);
      process.exit(1);
    }
  }

  protected buildErrorMessage(error: string | Error | Record<any, any>, code?: number) {
    let message = '';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else {
      message = JSON.stringify(error);
    }
    return {
      payload: null,
      error: {
        message,
        code,
      },
    };
  }

  protected convertBaggaggeToExternalHeader(baggage?: Partial<Baggage>): ExternalBaggage {
    if (!baggage) {
      return {};
    }
    const headers: ExternalBaggage = {};
    if (baggage.expired) {
      headers['nsc-expired'] = baggage.expired;
    }
    if (baggage.requestId) {
      headers['x-request-id'] = baggage.requestId;
    }
    if (baggage.traceId) {
      headers['nsc-trace-id'] = baggage.traceId;
    }
    if (baggage.spanId) {
      headers['nsc-span-id'] = baggage.spanId;
    }
    if (baggage.traceFlags) {
      headers['nsc-trace-flags'] = baggage.traceFlags;
    }
    return headers;
  }

  protected applyTag(span: opentelemetry.Span, tag?: Tag) {
    if (!tag) {
      return;
    }

    if (tag?.[TagKey.TYPE] === 'dbms') {
      span.setAttribute('db.system', tag?.[TagKey.NAME]);
      if (tag?.[TagKey.TARGET]) {
        span.setAttribute('db.name', tag[TagKey.TARGET]!);
      }
    }
    if (tag?.[TagKey.TYPE] === 'api') {
      span.setAttribute('net.peer.name', tag?.[TagKey.NAME]);
      if (tag?.[TagKey.TARGET]) {
        span.setAttribute('http.target', tag[TagKey.TARGET]!);
      }
    }
  }
}
