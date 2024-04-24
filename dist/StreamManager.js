"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamManager = void 0;
const nats_1 = require("nats");
const Root_1 = require("./Root");
class StreamManager extends Root_1.Root {
    constructor(param) {
        super(param.broker, param.outputFormatter);
        this.param = param;
        this.STAR_WILDCARD = '*';
        this.GREATER_WILDCARD = '>';
        this.TWO_WEEKS_IN_SECOND = 1209600;
        this.ONE_DAY_IN_SECOND = 86400;
        this.defaultStreamOption = {
            storage: 'file',
            retentionPolicy: 'limits',
            discardPolicy: 'old',
            messageTTL: this.TWO_WEEKS_IN_SECOND,
            duplicateTrackingTime: this.ONE_DAY_IN_SECOND,
            replication: 1,
            rollUps: true,
        };
    }
    async createStreams() {
        if (!this.jsm) {
            this.jsm = await this.param.broker.jetstreamManager();
        }
        for await (const { action, ...options } of this.param.options.actions) {
            const streamName = this.getStreamName(action);
            const config = {
                name: streamName,
                subjects: [`${this.param.serviceName}.${this.param.options.prefix}.${action}`],
                retention: (options.retentionPolicy || this.defaultStreamOption.retentionPolicy),
                storage: (options.storage || this.defaultStreamOption.storage),
                num_replicas: options.replication || this.defaultStreamOption.replication,
                discard: (options.discardPolicy || this.defaultStreamOption.discardPolicy),
                max_age: this.convertSecondsToNanoseconds(options.messageTTL || this.defaultStreamOption.messageTTL),
                max_bytes: options.maxBytes,
                duplicate_window: this.convertSecondsToNanoseconds(options.duplicateTrackingTime || this.defaultStreamOption.duplicateTrackingTime),
                allow_rollup_hdrs: options.rollUps || this.defaultStreamOption.rollUps,
            };
            const existingStream = await this.jsm.streams.info(streamName).catch(error => {
                if (this.isNotFoundStreamError(error)) {
                    return null;
                }
                throw error;
            });
            if (!existingStream) {
                await this.jsm.streams.add(config);
                continue;
            }
            await this.jsm.streams.update(streamName, { ...existingStream.config, ...config });
        }
    }
    async createConsumer(serviceNameFrom, eventName, setting) {
        const consumerName = this.capitalizeFirstLetter(serviceNameFrom) + this.capitalizeFirstLetter(eventName);
        const prefix = this.param.options.prefix;
        const subjeсt = `${this.param.serviceName}.${prefix}.${eventName}`;
        const options = (0, nats_1.consumerOpts)();
        options
            .durable(consumerName)
            .manualAck()
            .ackExplicit()
            .maxAckPending((setting === null || setting === void 0 ? void 0 : setting.maxPending) || 10)
            .deliverTo((0, nats_1.createInbox)());
        if (setting === null || setting === void 0 ? void 0 : setting.queue) {
            options.queue(setting.queue);
        }
        if (setting === null || setting === void 0 ? void 0 : setting.deliver) {
            if (setting.deliver === 'new') {
                options.deliverNew();
            }
            if (setting.deliver === 'all') {
                options.deliverAll();
            }
        }
        return this.broker.jetstream().subscribe(subjeсt, options);
    }
    getStreamName(eventName) {
        const serviceName = this.capitalizeFirstLetter(this.param.serviceName);
        const prefix = this.buildPrefixForStreamName(this.param.options.prefix);
        let streamName = `${serviceName}${prefix}`;
        if (eventName !== this.STAR_WILDCARD && eventName !== this.GREATER_WILDCARD) {
            streamName += this.capitalizeFirstLetter(eventName);
        }
        return streamName;
    }
    isNotFoundStreamError(error) {
        const ERROR_TYPE = 'NatsError';
        const ERROR_NOT_FOUND_STREAM = 'stream not found';
        if (error instanceof Error) {
            return error.name === ERROR_TYPE && error.message === ERROR_NOT_FOUND_STREAM;
        }
        return false;
    }
    buildPrefixForStreamName(prefix) {
        return prefix.split(this.SUBJECT_DELIMITER).map(this.capitalizeFirstLetter).join();
    }
    capitalizeFirstLetter(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }
    convertSecondsToNanoseconds(seconds) {
        return seconds * 1000000000;
    }
}
exports.StreamManager = StreamManager;
//# sourceMappingURL=StreamManager.js.map