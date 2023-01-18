import { related, service } from '../../../../injector';
import { BaseMethod } from '../../../../Method';
import { methods } from '../math.service.json';
import { MathClient } from '..';

@related
export class SumServiceRelation extends BaseMethod {
  static settings = methods.Sum;
  @service(MathClient) private client: MathClient;
  public async handler() {
    const result = await this.client.sum({ a: 5, b: 5 });
    return result;
  }
}
