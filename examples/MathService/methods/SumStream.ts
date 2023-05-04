import { SumStreamResponse } from '../interfaces';
import { related } from '../../../src/injector';
import { methods } from '../service.schema.json';
import { Readable } from 'stream';
import { BaseMethod } from '../../../src/Method';
import { EmitterMath } from '../interfaces';
import { PerformanceObserver, performance } from 'perf_hooks';

@related
export class SumStream extends BaseMethod<EmitterMath> {
  static settings = methods.SumStream;
  private result = 0;
  private observer = new PerformanceObserver(items => {
    this.emitter.Elapsed({ elapsed: items.getEntries()[0].duration });
    performance.clearMarks();
    this.observer.disconnect();
  });

  public async handler(request: Readable): Promise<SumStreamResponse> {
    this.observer.observe({ type: 'measure' });

    performance.mark('durationSum');

    this.emitter.Notify({ method: 'SumStream' });

    for await (const chunk of request) {
      const sequenceNumber = +Buffer.from(chunk).toString();
      this.result += sequenceNumber;
    }

    performance.measure('Duration', 'durationSum');

    return { result: this.result };
  }
}
