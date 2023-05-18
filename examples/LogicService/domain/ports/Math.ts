import { Readable } from 'stream';

export interface MathPort {
  sum(params: { a: number; b: number }): Promise<{ result: number }>;
  sumStream(params: Readable): Promise<{ result: number }>;
  fibonacci(params: { length: number }): Promise<Readable>;
}
