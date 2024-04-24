"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonToBufferTransform = void 0;
const stream_1 = require("stream");
class JsonToBufferTransform extends stream_1.Transform {
    _transform(chunk, encoding, cb) {
        cb(null, Buffer.from(JSON.stringify(chunk)));
    }
}
exports.JsonToBufferTransform = JsonToBufferTransform;
//# sourceMappingURL=JsonToBufferTransform.js.map