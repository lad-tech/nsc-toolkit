"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnionBroker = void 0;
const node_stream_1 = require("node:stream");
const node_stream_2 = require("node:stream");
const node_crypto_1 = require("node:crypto");
const Subscription_1 = require("./Subscription");
const JetStreamManager_1 = require("./JetStreamManager");
const JetStreamClient_1 = require("./JetStreamClient");
class UnionBroker {
    constructor() {
        this.isUnion = true;
        this.DEFAULT_TIMEOUT = 60000; // 1 Minut
        this.emitter = new node_stream_1.EventEmitter();
    }
    closed() {
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
    publish(subject, data, options) {
        this.emitter.emit(subject, { data });
    }
    subscribe(subject, opts) {
        const subscription = new Subscription_1.UnionSubscription({ objectMode: true });
        const listener = (message, uniqResponseKey) => {
            if (uniqResponseKey) {
                message['respond'] = (data) => this.emitter.emit(uniqResponseKey, { data });
            }
            subscription.write(message);
        };
        this.emitter.on(subject, listener);
        subscription.on('close', () => {
            this.emitter.off(subject, listener);
        });
        return subscription;
    }
    request(subject, data, opts) {
        const uniqResponseKey = (0, node_crypto_1.randomUUID)();
        const timeout = (opts === null || opts === void 0 ? void 0 : opts.timeout) || this.DEFAULT_TIMEOUT;
        this.emitter.emit(subject, { data }, uniqResponseKey);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(reject, timeout);
            this.emitter.once(uniqResponseKey, response => {
                clearTimeout(timer);
                resolve(response);
            });
        });
    }
    flush() {
        return Promise.resolve();
    }
    drain() {
        return Promise.resolve();
    }
    isClosed() {
        throw new Error('Method isClosed not implemented.');
    }
    isDraining() {
        throw new Error('Method isDraining not implemented.');
    }
    getServer() {
        throw new Error('Method getServer not implemented.');
    }
    status() {
        return new node_stream_2.PassThrough();
    }
    stats() {
        throw new Error('Method stats not implemented.');
    }
    jetstreamManager(opts) {
        return Promise.resolve(JetStreamManager_1.jetStreamManagerBlank);
    }
    jetstream(opts) {
        return new JetStreamClient_1.JetStreamClientBlank(this.emitter);
    }
    rtt() {
        throw new Error('Method rtt not implemented.');
    }
}
exports.UnionBroker = UnionBroker;
//# sourceMappingURL=Broker.js.map