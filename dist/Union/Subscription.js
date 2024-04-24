"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnionSubscription = void 0;
const node_stream_1 = require("node:stream");
class UnionSubscription extends node_stream_1.PassThrough {
    unsubscribe(max) {
        this.destroy();
    }
    drain() {
        throw new Error('Method drain not implemented.');
    }
    isDraining() {
        throw new Error('Method isDraining not implemented.');
    }
    isClosed() {
        throw new Error('Method isClosed not implemented.');
    }
    callback(err, msg) {
        throw new Error('Method callback not implemented.');
    }
    getSubject() {
        throw new Error('Method getSubject not implemented.');
    }
    getReceived() {
        throw new Error('Method getReceived not implemented.');
    }
    getProcessed() {
        throw new Error('Method getProcessed not implemented.');
    }
    getPending() {
        throw new Error('Method getPending not implemented.');
    }
    getID() {
        throw new Error('Method getID not implemented.');
    }
    getMax() {
        throw new Error('Method getMax not implemented.');
    }
    destroy(error) {
        throw new Error('Method destroy not implemented.');
    }
    consumerInfo() {
        throw new Error('Method consumerInfo not implemented.');
    }
}
exports.UnionSubscription = UnionSubscription;
//# sourceMappingURL=Subscription.js.map