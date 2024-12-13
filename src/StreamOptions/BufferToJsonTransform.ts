import { Logs } from '@lad-tech/toolbelt';
import { Transform, TransformCallback, TransformOptions } from 'stream';

export class BufferToJsonTransform<T = any> extends Transform {
  private head: Buffer = Buffer.from('');
  private static errors = {
    CONVERSION_ERROR: 'Failed to convert data',
  };
  private logger?: Logs.Logger;
  constructor(options: TransformOptions & { logger?: Logs.Logger }) {
    super({ objectMode: true, highWaterMark: 10, ...options });
    this.logger = options.logger;
  }
  async _transform(tail: Buffer, _: BufferEncoding, cb: TransformCallback) {
    try {
      tail = Buffer.concat([this.head, Buffer.from(tail)]);
      const jsonData = JSON.parse(tail.toString()) as T;
      cb(null, jsonData);
      this.head = Buffer.from('');
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.head = Buffer.from(tail);
        this.logger?.error(BufferToJsonTransform.errors.CONVERSION_ERROR, tail.toString());
        cb();
        return;
      }
      cb(error);
    }
  }
}
