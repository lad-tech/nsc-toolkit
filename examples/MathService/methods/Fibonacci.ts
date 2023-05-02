import { FibonacciRequest } from '../interfaces';
import { related } from '../../../src/injector';
import { methods } from '../service.json';
import { Readable } from 'stream';
import { setTimeout } from 'timers/promises';
import { BaseMethod } from '../../../src/Method';

@related
export class Fibonacci extends BaseMethod {
  static settings = methods.Fibonacci;
  private firstNumber = 0;
  private secondNumber = 1;
  public async handler(request: FibonacciRequest): Promise<Readable> {
    const { length } = request;
    return Readable.from(this.getFibonacciSequence(length));
  }
  private async *getFibonacciSequence(length: number) {
    let limit = length;
    do {
      await setTimeout(100);
      const nextNumber = this.firstNumber + this.secondNumber;
      this.firstNumber = this.secondNumber;
      this.secondNumber = nextNumber;
      yield nextNumber;
      limit--;
    } while (limit > 0);
  }
}
