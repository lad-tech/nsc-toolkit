"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamApiBlank = void 0;
class StreamApiBlank {
    info(stream, opts) {
        return Promise.resolve({});
    }
    add(cfg) {
        return {};
    }
    update(name, cfg) {
        return {};
    }
    purge(stream, opts) {
        throw new Error('Method purge not implemented.');
    }
    delete(stream) {
        throw new Error('Method delete not implemented.');
    }
    list() {
        throw new Error('Method list not implemented.');
    }
    deleteMessage(stream, seq, erase) {
        throw new Error('Method deleteMessage not implemented.');
    }
    getMessage(stream, query) {
        throw new Error('Method getMessage not implemented.');
    }
    find(subject) {
        throw new Error('Method find not implemented.');
    }
}
exports.StreamApiBlank = StreamApiBlank;
//# sourceMappingURL=StreamApi.js.map