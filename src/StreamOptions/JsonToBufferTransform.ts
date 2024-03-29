import { Transform, TransformCallback } from 'stream';

export class JsonToBufferTransform<T> extends Transform {
  _transform(chunk: T, encoding: BufferEncoding, cb: TransformCallback) {
    cb(null, Buffer.from(JSON.stringify(chunk)));
  }
}
