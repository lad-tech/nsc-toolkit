import { Transform, TransformCallback, TransformOptions } from 'stream';

export class JsonToBufferTransform<T> extends Transform {
  constructor(opts: TransformOptions) {
    super({ ...opts, objectMode: true });
  }
  _transform(chunk: T, encoding: BufferEncoding, cb: TransformCallback) {
    cb(null, Buffer.from(JSON.stringify(chunk)));
  }
}
