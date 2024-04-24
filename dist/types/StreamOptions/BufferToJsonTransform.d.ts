/// <reference types="node" />
/// <reference types="node" />
import { Logs } from '@lad-tech/toolbelt';
import { Transform, TransformCallback, TransformOptions } from 'stream';
export declare class BufferToJsonTransform<T = any> extends Transform {
    private head;
    private static errors;
    private logger?;
    constructor(options: TransformOptions & {
        logger?: Logs.Logger;
    });
    _transform(tail: Buffer, _: BufferEncoding, cb: TransformCallback): Promise<void>;
}
