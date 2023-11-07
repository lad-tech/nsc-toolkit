import { Transform, TransformCallback, TransformOptions } from 'stream';

class BufferToJsonTransform<T> extends Transform {
  private head: Buffer | undefined;
  private errors = {
    CONVERSION_ERROR: 'Не удалось преобразовать данные',
  };
  constructor(options: TransformOptions) {
    super({ objectMode: true, highWaterMark: 10, ...options });
  }
  async _transform(tail: Buffer, _: BufferEncoding, cb: TransformCallback) {
    let partnerParams: T | undefined;
    try {
      try {
        if (this.head) {
          tail = Buffer.concat([this.head, Buffer.from(tail)]);
          partnerParams = JSON.parse(tail.toString());
          this.head = undefined;
        } else {
          partnerParams = JSON.parse(tail.toString());
        }
      } catch (err) {
        this.head = Buffer.from(tail);
        cb();
      }

      if (partnerParams) {
        cb(null, partnerParams);
      }
    } catch (error) {
      console.error(this.errors.CONVERSION_ERROR, tail.toString());
      if (error instanceof Error) {
        cb(error);
      } else {
        cb(new Error(this.errors.CONVERSION_ERROR));
      }
    }
  }
}
