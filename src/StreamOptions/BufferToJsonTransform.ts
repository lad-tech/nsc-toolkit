import { Logs } from '@lad-tech/toolbelt';
import { Transform, TransformCallback, TransformOptions } from 'stream';

export class BufferToJsonTransform<T> extends Transform {
  private head: Buffer = Buffer.from('');
  private static errors = {
    CONVERSION_ERROR: 'Не удалось преобразовать данные',
  };
  private logger: Logs.Logger;
  constructor(options: TransformOptions & { logger: Logs.Logger }) {
    super({ objectMode: true, highWaterMark: 10, ...options });
    this.logger = options.logger;
  }
  async _transform(tail: Buffer, _: BufferEncoding, cb: TransformCallback) {
    let jsonData: T | undefined;
    try {
      try {
        tail = Buffer.concat([this.head, Buffer.from(tail)]);
        jsonData = JSON.parse(tail.toString()) as T;
      } catch (err) {
        this.head = Buffer.from(tail);
        cb();
      }

      if (jsonData) {
        cb(null, jsonData);
      }
    } catch (error) {
      this.logger.error(BufferToJsonTransform.errors.CONVERSION_ERROR, tail.toString());
      if (error instanceof Error) {
        cb(error);
      } else {
        cb(new Error(BufferToJsonTransform.errors.CONVERSION_ERROR));
      }
    }
  }
}
