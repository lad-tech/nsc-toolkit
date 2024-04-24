"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const opentelemetry = require("@opentelemetry/api");
const ajv_1 = require("ajv");
const nats_1 = require("nats");
const node_crypto_1 = require("node:crypto");
const http = require("node:http");
const node_stream_1 = require("node:stream");
const promises_1 = require("node:timers/promises");
const Root_1 = require("./Root");
const StreamManager_1 = require("./StreamManager");
class Client extends Root_1.Root {
    constructor({ broker, events, loggerOutputFormatter, serviceName, baggage, cache, Ref }) {
        super(broker, loggerOutputFormatter);
        this.subscriptions = new Map();
        this.REQUEST_HTTP_SETTINGS_TIMEOUT = 1000; // ms
        this.logger.setLocation(serviceName);
        this.serviceName = serviceName;
        this.baggage = baggage;
        this.cache = cache;
        this.events = events;
        this.Ref = Ref;
    }
    async startWatch(subscription, listener, eventName) {
        for await (const event of subscription) {
            let data;
            try {
                data = (0, nats_1.JSONCodec)().decode(event.data);
            }
            catch (error) {
                data = (0, nats_1.StringCodec)().decode(event.data);
            }
            const message = { data };
            if (this.isJsMessage(event)) {
                message.ack = event.ack.bind(event);
                message.nak = event.nak.bind(event);
            }
            listener.emit(`${eventName}`, message);
        }
    }
    /**
     * Make listener for service events. Auto subscribe and unsubscribe to subject
     */
    getListener(serviceNameFrom, options) {
        if (!this.events) {
            throw new Error('The service does not generate events');
        }
        const listener = new node_stream_1.EventEmitter();
        return new Proxy(listener, {
            get: (target, prop, receiver) => {
                const method = Reflect.get(target, prop, receiver);
                if (prop === 'on') {
                    return async (eventName, handler) => {
                        var _a, _b;
                        try {
                            this.logger.info('Subscribe', eventName);
                            const action = (_a = this.events) === null || _a === void 0 ? void 0 : _a.list[eventName];
                            if (!action) {
                                throw new Error(`The service does not generate ${String(eventName)} event`);
                            }
                            const isStream = (_b = action.options) === null || _b === void 0 ? void 0 : _b.stream;
                            let subscription;
                            if (isStream) {
                                subscription = await new StreamManager_1.StreamManager({
                                    broker: this.broker,
                                    options: this.events.streamOptions,
                                    serviceName: this.serviceName,
                                }).createConsumer(serviceNameFrom, String(eventName), options);
                            }
                            else {
                                const queue = (options === null || options === void 0 ? void 0 : options.queue) ? { queue: options.queue } : {};
                                subscription = this.broker.subscribe(`${this.serviceName}.${eventName}`, queue);
                            }
                            this.subscriptions.set(eventName, subscription);
                            this.startWatch(subscription, listener, String(eventName));
                            return method.call(target, eventName, handler);
                        }
                        catch (error) {
                            this.logger.error(`Failed subscribe to subject`, error);
                        }
                    };
                }
                if (prop === 'off') {
                    return (eventName, listener) => {
                        this.logger.info('Unsubscribe', eventName);
                        const subscription = this.subscriptions.get(eventName);
                        subscription === null || subscription === void 0 ? void 0 : subscription.unsubscribe();
                        this.subscriptions.delete(eventName);
                        return method.call(target, eventName, listener);
                    };
                }
                return method;
            },
        });
    }
    createCacheKey(subject, data) {
        const dataHash = (0, node_crypto_1.createHash)('sha1').update(JSON.stringify(data)).digest('hex');
        return `${this.CACHE_SERVICE_KEY}:${subject}:${dataHash}`;
    }
    validate(data, schema) {
        const ajv = new ajv_1.default();
        if (this.Ref) {
            ajv.addSchema(this.Ref);
        }
        const requestValidator = ajv.compile(schema);
        const valid = requestValidator(data);
        if (!valid) {
            throw new Error(JSON.stringify(requestValidator.errors));
        }
    }
    async request(subject, data, { options, request, response }) {
        var _a, _b, _c, _d;
        const tracer = opentelemetry.trace.getTracer('');
        const span = tracer.startSpan(subject, undefined, this.getContext(this.baggage));
        try {
            if (((_a = options === null || options === void 0 ? void 0 : options.runTimeValidation) === null || _a === void 0 ? void 0 : _a.request) && request) {
                this.validate(data, request);
            }
            const { spanId, traceId, traceFlags } = span.spanContext();
            const expired = this.getExpired((_b = this.baggage) === null || _b === void 0 ? void 0 : _b.expired, options === null || options === void 0 ? void 0 : options.timeout);
            const message = { payload: data, baggage: { expired, traceId, spanId, traceFlags } };
            const timeout = expired - Date.now();
            if (timeout <= 0) {
                throw new Error('Timeout request service ' + subject);
            }
            let key = '';
            if ((options === null || options === void 0 ? void 0 : options.cache) && !this.isStream(data) && this.cache) {
                try {
                    key = this.createCacheKey(subject, data);
                    const result = await Promise.race([this.cache.service.get(key), (0, promises_1.setTimeout)(this.cache.timeout, null)]);
                    if (result) {
                        return JSON.parse(result);
                    }
                }
                catch (error) {
                    this.logger.warn('get cache: ', error);
                }
            }
            const result = (options === null || options === void 0 ? void 0 : options.useStream)
                ? await this.makeHttpRequest(subject, message, options, timeout)
                : await this.makeBrokerRequest(subject, message, timeout);
            if (result.error) {
                throw new Error((_c = result.error.message) !== null && _c !== void 0 ? _c : result.error);
            }
            if (((_d = options === null || options === void 0 ? void 0 : options.runTimeValidation) === null || _d === void 0 ? void 0 : _d.response) && response) {
                this.validate(result.payload, response);
            }
            if ((options === null || options === void 0 ? void 0 : options.cache) && !this.isStream(result.payload) && this.cache) {
                this.cache.service.set(key, JSON.stringify(result.payload), options.cache);
            }
            return result.payload;
        }
        catch (error) {
            span.setAttribute('error', true);
            span.setAttribute('error.kind', error);
            this.logger.error(error);
            throw error;
        }
        finally {
            span.end();
        }
    }
    async getHTTPSettingsFromRemoteService() {
        const subject = `${this.serviceName}.${this.SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS}`;
        const result = await this.broker.request(subject, Buffer.from(JSON.stringify('')), {
            timeout: this.REQUEST_HTTP_SETTINGS_TIMEOUT,
        });
        const { ip, port } = (0, nats_1.JSONCodec)().decode(result.data);
        if (!ip || !port) {
            throw new Error(`Remote service ${this.serviceName} did not return http settings`);
        }
        return { ip, port };
    }
    isStream(data) {
        return data instanceof node_stream_1.Readable;
    }
    async makeBrokerRequest(subject, message, timeout) {
        try {
            const result = await this.broker.request(subject, Buffer.from(JSON.stringify(message)), { timeout });
            return (0, nats_1.JSONCodec)().decode(result.data);
        }
        catch (error) {
            return this.buildErrorMessage(error);
        }
    }
    async makeHttpRequest(subject, message, options, timeout) {
        return new Promise(async (resolve) => {
            const { ip, port } = await this.getHTTPSettingsFromRemoteService();
            const serviceActionPath = subject.split('.');
            const headersFromBaggage = this.convertBaggaggeToExternalHeader(message.baggage);
            const headers = {
                'Content-Type': this.isStream(message.payload) ? 'application/octet-stream' : 'application/json',
                ...headersFromBaggage,
            };
            if (!this.isStream(message.payload)) {
                headers['Content-Length'] = Buffer.byteLength(JSON.stringify(message.payload));
            }
            const request = http.request({
                host: ip,
                port,
                path: `/${serviceActionPath.join('/')}`,
                method: 'POST',
                headers,
                timeout,
            }, async (response) => {
                var _a;
                if (((_a = options === null || options === void 0 ? void 0 : options.useStream) === null || _a === void 0 ? void 0 : _a.response) && response.statusCode !== 500) {
                    resolve({ payload: response });
                    return;
                }
                const data = [];
                for await (const chunk of response) {
                    data.push(chunk);
                }
                const responseDataString = Buffer.concat(data).toString();
                try {
                    resolve(JSON.parse(responseDataString));
                }
                catch (error) {
                    resolve(this.buildErrorMessage(error));
                }
            });
            request.on('error', error => {
                resolve(this.buildErrorMessage(error));
            });
            if (this.isStream(message.payload)) {
                message.payload.pipe(request);
                return;
            }
            request.write(JSON.stringify(message.payload));
            request.end();
        });
    }
    convertBaggaggeToExternalHeader(baggage) {
        if (!baggage) {
            return {};
        }
        return {
            'nsc-expired': baggage.expired,
            'nsc-trace-id': baggage.traceId,
            'nsc-span-id': baggage.spanId,
            'nsc-trace-flags': baggage.traceFlags,
        };
    }
    isJsMessage(message) {
        return !!message.ack && !!message.nak;
    }
}
exports.Client = Client;
//# sourceMappingURL=Client.js.map