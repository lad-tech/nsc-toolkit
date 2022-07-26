import { WeirdSumRequest, WeirdSumResponse } from '../interfaces';
import { related, service } from '../../../src/injector';
import { methods } from '../service.json';

import Math from '../../MathService';
import { BaseMethod } from '../../../src/Method';

@related
export class WeirdSum extends BaseMethod {
  static settings = methods.WeirdSum;
  @service(Math) private math: Math;

  public async handler(request: WeirdSumRequest): Promise<WeirdSumResponse> {
    const sum = await this.math.sum(request);
    const fibonacci = await this.math.fibonacci({ length: sum.result });
    this.logger.info('Some info');
    const result = await this.math.sumStream(fibonacci);
    return result;
  }
}
