// SERVICE

import { EventHandler, EventStreamHandler } from '../../src';

export interface ElapsedEvent {
  elapsed: number;
}

export interface NotifyEvent {
  method: string;
}

export type EmitterMath = {
  Elapsed: (params: ElapsedEvent) => void;
  Notify: (params: NotifyEvent) => void;
};

export type EmitterMathExternal = {
  Elapsed: EventStreamHandler<ElapsedEvent>;
  Notify: EventHandler<NotifyEvent>;
};

export type SumRequest = {
  a: number;
  b: number;
};

export interface SumResponse {
  result: number;
}

export type FibonacciRequest = {
  length: number;
};

export type SumStreamResponse = {
  result: number;
};
