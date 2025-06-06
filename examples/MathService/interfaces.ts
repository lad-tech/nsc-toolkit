// SERVICE

import { EventHandler, EventStreamHandler } from '../../src';

export interface ElapsedEvent {
  elapsed: number;
}

export interface NotifyEvent {
  method: string;
}

export interface FibonacciNumberEvent {
  number: number;
}

export type EmitterMath = {
  Elapsed: (params: ElapsedEvent, uniqId?: string) => void;
  Notify: (params: NotifyEvent, uniqId?: string) => void;
  FibonacciNumber: (params: FibonacciNumberEvent, uniqId?: string) => void;
};

export type EmitterMathExternal = {
  Elapsed: EventStreamHandler<ElapsedEvent>;
  Notify: EventHandler<NotifyEvent>;
  FibonacciNumber: EventStreamHandler<FibonacciNumberEvent>;
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
