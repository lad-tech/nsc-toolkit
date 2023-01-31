import { related, instance } from '../../../../injector';
import { BaseMethod } from '../../../../Method';
import { methods } from '../math.service.json';
import { mathHelperInstance } from '../MathHelperInstance';

@related
export class SumInstanceRelation extends BaseMethod {
  static settings = methods.Sum;
  @instance(mathHelperInstance) private client: {
    sum: (params: { a: number; b: number }) => Promise<{ result: number }>;
  };
  public async handler() {
    const result = await this.client.sum({ a: 5, b: 5 });
    return result;
  }
}
