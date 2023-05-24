import { WeirdSumRequest, WeirdSumResponse } from '../interfaces';
import { inject } from '../../../src/injector';
import { methods } from '../service.schema.json';
import { TYPES } from '../inversion.types';
import { MathPort } from '../domain/ports/Math';

import { BaseMethod } from '../../../src/Method';

export class WeirdSum extends BaseMethod {
  static settings = methods.WeirdSum;
  @inject(TYPES.Math) private math: MathPort;

  public async handler(request: WeirdSumRequest): Promise<WeirdSumResponse> {
    this.logger.info('sum started: ', request);
    const sum = await this.math.sum(request);
    const fibonacci = await this.math.fibonacci({ length: sum.result });
    this.logger.info('Some info');
    const result = await this.math.sumStream(fibonacci);
    return result;
  }
}
