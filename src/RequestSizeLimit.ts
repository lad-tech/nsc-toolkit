import { Transform, TransformCallback } from 'node:stream';

export class RequestSizeLimitError extends Error {
  constructor(maxBytes: number) {
    super(`Streamed request exceeds ${maxBytes} bytes`);
  }
}

/** Counts bytes without buffering the request or bypassing stream backpressure. */
export class RequestSizeLimit extends Transform {
  private received = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  public _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    this.received += chunk.length;
    if (this.received > this.maxBytes) {
      callback(new RequestSizeLimitError(this.maxBytes));
      return;
    }
    callback(null, chunk);
  }
}
