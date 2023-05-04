import { SumRequest, SumResponse } from '../interfaces';
import { related } from '../../../src/injector';
import { methods } from '../service.schema.json';
import { BaseMethod } from '../../../src/Method';

@related
export class Sum extends BaseMethod {
  static settings = methods.Sum;
  public async handler(request: SumRequest): Promise<SumResponse> {
    const { a, b } = request;
    return { result: this.sum(a, b) };
  }
  private sum(a: number, b: number) {
    return a + b;
  }
}
