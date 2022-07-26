// SERVICE

interface ElapsedEvent {
  elapsed: number;
}

export type EmitterMath = {
  elapsed: (params: ElapsedEvent) => void;
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
