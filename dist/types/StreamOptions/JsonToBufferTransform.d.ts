/// <reference types="node" />
/// <reference types="node" />
import { Transform, TransformCallback } from 'stream';
export declare class JsonToBufferTransform<T> extends Transform {
    _transform(chunk: T, encoding: BufferEncoding, cb: TransformCallback): void;
}
