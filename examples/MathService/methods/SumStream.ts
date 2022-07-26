import { SumStreamResponse } from '../interfaces';
import { related } from '../../../src/injector';
import { methods } from '../service.json';
import { Readable } from 'stream';
import { BaseMethod } from '../../../src/Method';

@related
export class SumStream extends BaseMethod {
  static settings = methods.SumStream;
  private result = 0;
  public async handler(request: Readable): Promise<SumStreamResponse> {
    for await (const chunk of request) {
      const sequenceNumber = +Buffer.from(chunk).toString();
      this.result += sequenceNumber;
    }
    return { result: this.result };
  }
}
