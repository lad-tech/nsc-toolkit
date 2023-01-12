// SERVICE

import { EventStreamHandler } from '../../src';

export interface ElapsedEvent {
  elapsed: number;
}

export type EmitterMath = {
  Elapsed: (params: ElapsedEvent) => void;
};

export type EmitterMathExternal = {
  Elapsed: EventStreamHandler<ElapsedEvent>;
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
