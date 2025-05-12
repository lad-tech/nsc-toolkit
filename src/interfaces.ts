// COMMON

import type { Logs } from '@lad-tech/toolbelt';
import type { NatsConnection } from 'nats';
import type { Client } from './Client';

export interface MethodOptions {
  useStream?: {
    request?: boolean;
    response?: boolean;
  };
  cache?: number; // in minuts
  timeout?: number; // in milliseconds
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
  new (...args: any[]): { handler: (params: any) => Promise<any> };
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
  requestId?: string;
  expired?: number;
};

export type ExternalBaggage = {
  'nsc-expired'?: number;
  'nsc-trace-id'?: string;
  'nsc-span-id'?: string;
  'nsc-trace-flags'?: number;
  'x-request-id'?: string;
};

export interface Message<M = any> {
  payload: M;
  baggage?: Baggage;
  error?: {
    message: string;
    code?: number;
  };
}

export type Emitter = Record<string, (params: any) => void>;

export interface CacheSettings {
  service: CacheService;
  timeout: number;
}

export interface GracefulShutdownAdditionalService {
  close: () => Promise<any>;
}

export interface ClientParam<E extends Emitter = Emitter> {
  broker: NatsConnection;
  serviceName: string;
  baggage?: Baggage;
  cache?: CacheSettings;
  loggerOutputFormatter?: Logs.OutputFormatter;
  events?: Events<E>;
  Ref?: object;
}

export interface GetListenerOptions {
  queue?: string;
  deliver?: 'all' | 'new';
  maxPending?: number;
  maxAckWaiting?: number;
}

export interface GetBatchListenerOptions extends GetListenerOptions {
  batch: true;
  maxPullRequestBatch?: number;
  maxPullRequestExpires?: number;
  ackPolicy?: 'all' | 'none';
}

export interface StreamManagerParam {
  serviceName: string;
  options: StreamOptions;
  broker: NatsConnection;
  outputFormatter?: Logs.OutputFormatter;
}

export interface EmitterEvent<D extends Record<string, any>> {
  data: D;
  meter: EventMeter;
}

export interface EmitterStreamEvent<D extends Record<string, any>> extends EmitterEvent<D> {
  ack: () => void;
  nak: (millis: number) => void;
  meter: EventMeter;
}

export interface StreamAction {
  action: string;
  storage?: 'file' | 'memory' | string;
  retentionPolicy?: 'limits' | 'interest' | 'workQueue' | string;
  discardPolicy?: 'old' | 'new' | string;
  messageTTL?: number; // in seconds
  maxBytes?: number;
  duplicateTrackingTime?: number; // in seconds
  replication?: number;
  rollUps?: boolean;
}

export interface StreamOptions {
  prefix: string;
  actions: StreamAction[];
}

export interface Event {
  action: string;
  options?: {
    stream?: boolean;
  };
  description: string;
  event: Record<string, unknown>;
}

export interface Events<E extends Emitter> {
  list: Record<keyof E, Event>;
  streamOptions: StreamOptions;
}

export interface ServiceOptions<E extends Emitter> {
  name: string;
  brokerConnection?: NatsConnection;
  methods: Method[];
  events?: Events<E>;
  cache?: CacheSettings;
  loggerOutputFormatter?: Logs.OutputFormatter;
  gracefulShutdown?: {
    additional?: GracefulShutdownAdditionalService[];
    timeout?: number;
  };
}

export type EventStreamHandler<P extends Record<string, any>> = (params: EmitterStreamEvent<P>) => void;
export type EventHandler<P extends Record<string, any>> = (params: EmitterEvent<P>) => void;

export interface Listener<E extends Emitter> {
  on<A extends keyof E>(action: A, handler: E[A]): void;
  off<A extends keyof E>(action: A, handler: E[A]): void;
}

export interface ListenerBatch<E extends Emitter> {
  on<A extends keyof E>(action: A, handler: (params: Array<Parameters<E[A]>[0]>) => void): void;
  off<A extends keyof E>(action: A, handler: (params: Array<Parameters<E[A]>[0]>) => void): void;
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

export type InitializableService = GracefulShutdownAdditionalService & {
  init: () => Promise<any>;
};

export type DependencyType = typeof DependencyType[keyof typeof DependencyType];
export const DependencyType = {
  SERVICE: 'service', // External service
  ADAPTER: 'adapter', // A class with asynchronous methods such as a repository
  CONSTANT: 'constant', // Just an object
} as const;

export type TagKey = typeof TagKey[keyof typeof TagKey];
export const TagKey = {
  LOCATION: 'location',
  TYPE: 'type',
  NAME: 'name',
  TARGET: 'target',
} as const;

export type LocationTagValue = 'internal' | 'external';
export type TypeTagValue = 'dbms' | 'api';

export type Tag = {
  [TagKey.LOCATION]: LocationTagValue;
  [TagKey.TYPE]: TypeTagValue;
  [TagKey.NAME]: string;
  [TagKey.TARGET]?: string;
};

export interface EventMeter {
  start(): void;
  end(): void;
  measure<T extends (...args: any[]) => any>(func: T, arg: Parameters<T>, context: any, tag?: Tag): ReturnType<T>;
}
