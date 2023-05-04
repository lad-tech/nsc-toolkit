import { WeirdSumRequest, WeirdSumResponse } from '../interfaces';
import { related, service } from '../../../src/injector';
import { methods } from '../service.schema.json';

import Math from '../../MathService/index';
import { BaseMethod } from '../../../src/Method';

@related
export class WeirdSum extends BaseMethod {
  static settings = methods.WeirdSum;
  @service(Math) private math: Math;

  public async handler(request: WeirdSumRequest): Promise<WeirdSumResponse> {
    this.logger.info('sum started: ', request);
    const sum = await this.math.sum(request);
    const fibonacci = await this.math.fibonacci({ length: sum.result });
    this.logger.info('Some info');
    const result = await this.math.sumStream(fibonacci);
    return result;
  }
}
