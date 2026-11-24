import { Readable } from 'node:stream';
import { RequestSizeLimit, RequestSizeLimitError } from '../RequestSizeLimit';

describe('Streamed request byte limit', () => {
  test('counts bytes rather than characters across multiple chunks', async () => {
    const limit = new RequestSizeLimit(4);
    Readable.from([Buffer.from('я'), Buffer.from('ю')]).pipe(limit);
    const received: Buffer[] = [];
    for await (const chunk of limit) received.push(chunk);
    expect(Buffer.concat(received).toString()).toBe('яю');
  });

  test('does not forward the chunk crossing the limit', async () => {
    const limit = new RequestSizeLimit(4);
    const forwarded: Buffer[] = [];
    limit.on('data', chunk => forwarded.push(chunk));
    const error = new Promise<Error>(resolve => limit.once('error', resolve));
    limit.write(Buffer.from('123'));
    limit.write(Buffer.from('45'));
    await expect(error).resolves.toBeInstanceOf(RequestSizeLimitError);
    expect(Buffer.concat(forwarded).toString()).toBe('123');
  });

  test('does not read the entire source while the consumer is paused', async () => {
    let produced = 0;
    const source = Readable.from(
      (function* () {
        while (produced < 1000) {
          produced++;
          yield Buffer.alloc(1024);
        }
      })(),
    );
    const limit = new RequestSizeLimit(1024 * 1000);
    source.pipe(limit);
    await new Promise(resolve => setImmediate(resolve));
    expect(produced).toBeLessThan(1000);
    source.unpipe(limit);
    source.destroy();
    limit.destroy();
  });
});
