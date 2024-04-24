"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JetStreamClientBlank = void 0;
const Subscription_1 = require("./Subscription");
class JetStreamClientBlank {
    constructor(emitter) {
        this.emitter = emitter;
    }
    publish(subj, data, options) {
        throw new Error('Method publish not implemented.');
    }
    pull(stream, durable, expires) {
        throw new Error('Method pull not implemented.');
    }
    fetch(stream, durable, opts) {
        throw new Error('Method fetch not implemented.');
    }
    pullSubscribe(subject, opts) {
        throw new Error('Method pullSubscribe not implemented.');
    }
    subscribe(subject, opts) {
        const subscription = new Subscription_1.UnionSubscription({ objectMode: true });
        const listener = ({ data }) => {
            subscription.write({ data, ack: () => Promise.resolve(), nak: () => Promise.resolve() });
        };
        this.emitter.on(subject, listener);
        subscription.on('close', () => {
            this.emitter.off(subject, listener);
        });
        return Promise.resolve(subscription);
    }
}
exports.JetStreamClientBlank = JetStreamClientBlank;
//# sourceMappingURL=JetStreamClient.js.map