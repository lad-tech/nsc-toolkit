// COMMON

import type { NatsConnection } from 'nats';
import type { Client } from './Client';
import type { Logs } from '@lad-tech/toolbelt';

export interface MethodOptions {
  useStream?: {
    request?: boolean;
    response?: boolean;
  };
  cache?: number; // in minuts
  timeout?: number; // in seconds
  runTimeValidation?: {
    request?: boolean;
    response?: boolean;
  };
}

export interface MethodSettings {
  action: string;
  options?: MethodOptions;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface Method {
  settings: MethodSettings;
  new (): { handler: (params: any) => Promise<any> };
}

export type ClientService<C = Client> = new (
  natsConnection: NatsConnection,
  baggage?: Baggage,
  cache?: CacheSettings,
  loggerOutputFormatter?: Logs.OutputFormatter,
) => C;

export type Baggage = {
  traceId: string;
  spanId: string;
  traceFlags: number;
  expired?: number;
};

export type ExternalBaggage = {
  'nsc-expired'?: number;
  'nsc-trace-id'?: string;
  'nsc-span-id'?: string;
  'nsc-trace-flags'?: number;
};

export interface Message<M = any> {
  payload: M;
  baggage?: Baggage;
  error?: {
    message: string;
    code?: number;
  };
}

export type Emitter = Record<string, (params: unknown) => void>;

export interface CacheSettings {
  service: CacheService;
  timeout: number;
}

export interface ServiceOptions<E extends Emitter> {
  name: string;
  brokerConnection: NatsConnection;
  methods: Method[];
  events: keyof E extends [] ? [] : [keyof E];
  cache?: CacheSettings;
  loggerOutputFormatter?: Logs.OutputFormatter;
}

export interface Listener<E extends Emitter> {
  on<A extends keyof E>(action: A, handler: E[A]): void;
  off<A extends keyof E>(action: A, handler: E[A]): void;
}

export interface HttpSettings {
  ip?: string;
  port?: number;
}

export interface CacheService {
  set: (key: string, value: string, expired?: number) => Promise<void>;
  get: (key: string) => Promise<string | undefined>;
  delete: (key: string) => Promise<void>;
}
