"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferToJsonTransform = void 0;
const stream_1 = require("stream");
class BufferToJsonTransform extends stream_1.Transform {
    constructor(options) {
        super({ objectMode: true, highWaterMark: 10, ...options });
        this.head = Buffer.from('');
        this.logger = options.logger;
    }
    async _transform(tail, _, cb) {
        var _a;
        try {
            tail = Buffer.concat([this.head, Buffer.from(tail)]);
            const jsonData = JSON.parse(tail.toString());
            cb(null, jsonData);
            this.head = Buffer.from('');
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                this.head = Buffer.from(tail);
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(BufferToJsonTransform.errors.CONVERSION_ERROR, tail.toString());
                cb();
                return;
            }
            cb(error);
        }
    }
}
exports.BufferToJsonTransform = BufferToJsonTransform;
BufferToJsonTransform.errors = {
    CONVERSION_ERROR: 'Не удалось преобразовать данные',
};
//# sourceMappingURL=BufferToJsonTransform.js.map