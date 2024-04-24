"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
const Root_1 = require("./Root");
const nats_1 = require("nats");
const _1 = require(".");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const api_1 = require("@opentelemetry/api");
const exporter_jaeger_1 = require("@opentelemetry/exporter-jaeger");
const node_stream_1 = require("node:stream");
const promises_1 = require("node:stream/promises");
const toolbelt_1 = require("@lad-tech/toolbelt");
const http = require("node:http");
const os = require("node:os");
const promises_2 = require("node:timers/promises");
const node_util_1 = require("node:util");
const StreamManager_1 = require("./StreamManager");
class Service extends Root_1.Root {
    constructor(options) {
        super(options.brokerConnection, options.loggerOutputFormatter);
        this.options = options;
        this.emitter = {};
        this.subscriptions = [];
        this.httpMethods = new Map();
        this.rootSpans = new Map();
        this.serviceName = options.name;
        this.logger.setLocation(this.serviceName);
        if (options.events) {
            const events = Object.keys(options.events.list);
            this.emitter = events.reduce((result, eventName) => {
                result[eventName] = ((params) => {
                    var _a, _b, _c;
                    const subject = [options.name];
                    const eventOptions = (_a = options.events) === null || _a === void 0 ? void 0 : _a.list[eventName];
                    if ((_b = eventOptions === null || eventOptions === void 0 ? void 0 : eventOptions.options) === null || _b === void 0 ? void 0 : _b.stream) {
                        const prefix = (_c = options.events) === null || _c === void 0 ? void 0 : _c.streamOptions.prefix;
                        if (!prefix) {
                            throw new Error(`Stream prefix not set for event ${String(eventName)} marked as stream`);
                        }
                        subject.push(prefix);
                    }
                    subject.push(String(eventName));
                    this.broker.publish(subject.join('.'), this.buildMessage(params));
                });
                return result;
            }, this.emitter);
        }
        this.createTracer();
    }
    /**
     * Create global Tracer
     */
    createTracer() {
        const provider = new sdk_trace_base_1.BasicTracerProvider({
            resource: new resources_1.Resource({
                [semantic_conventions_1.SemanticResourceAttributes.SERVICE_NAME]: this.options.name,
            }),
        });
        let host;
        let port;
        const agentUrl = this.getSettingFromEnv('OTEL_AGENT', false);
        if (agentUrl) {
            const agent = agentUrl.split(':');
            host = agent[0];
            port = parseInt(agent[1]) || undefined;
        }
        const exporter = new exporter_jaeger_1.JaegerExporter({ host, port });
        provider.addSpanProcessor(new sdk_trace_base_1.SimpleSpanProcessor(exporter));
        provider.register();
    }
    finishSpan(span, error) {
        if (error) {
            span.setAttribute('error', true);
            span.setAttribute('error.kind', error.message);
        }
        span.end();
    }
    /**
     * Wrapper for async methods. Create span
     */
    perform(func, funcContext, arg, tracer, context) {
        const span = tracer.startSpan(func.name, undefined, context);
        try {
            const result = func.apply(funcContext, arg);
            if (result.then) {
                return result.then((result) => {
                    this.finishSpan(span);
                    return result;
                }, (error) => {
                    this.finishSpan(span, error);
                    throw error;
                });
            }
            this.finishSpan(span);
            return result;
        }
        catch (error) {
            this.finishSpan(span, error);
            throw error;
        }
    }
    /**
     * Build trap for object with async methods
     */
    getTrap(instance, tracer, baggage) {
        const perform = this.perform.bind(this);
        const context = this.getContext(baggage);
        return {
            get(target, propKey, receiver) {
                const method = Reflect.get(target, propKey, receiver);
                if (typeof method === 'function') {
                    return function (...args) {
                        return perform(method, instance, args, tracer, context);
                    };
                }
                else {
                    return method;
                }
            },
        };
    }
    /**
     * Creating an object to inject into Method (business logic)
     */
    createObjectWithDependencies(method, tracer, baggage) {
        const services = _1.ServiceContainer.get(method.settings.action) || new Map();
        const instances = _1.InstanceContainer.get(method.settings.action) || new Map();
        const dependences = { [_1.ConstructorDependencyKey]: [] };
        const dependencyStorage = Reflect.getMetadata(_1.dependencyStorageMetaKey, method);
        if (dependencyStorage && dependencyStorage.size) {
            // for constructor
            dependencyStorage.forEach((dependencyKey, propertyName) => {
                if (Array.isArray(dependencyKey)) {
                    if (propertyName === _1.ConstructorDependencyKey) {
                        dependencyKey.forEach((item, index) => {
                            const { dependency } = _1.container.get(item);
                            if (dependency.type === _1.DependencyType.SERVICE) {
                                dependences[_1.ConstructorDependencyKey][index] = new dependency.value(this.broker, baggage, this.options.cache);
                            }
                            if (dependency.type === _1.DependencyType.ADAPTER) {
                                const instance = _1.container.getInstance(item);
                                const trap = this.getTrap(instance, tracer, baggage);
                                dependences[_1.ConstructorDependencyKey][index] = new Proxy(instance, trap);
                            }
                            if (dependency.type === _1.DependencyType.CONSTANT) {
                                dependences[_1.ConstructorDependencyKey][index] = dependency.value;
                            }
                        });
                    }
                    return;
                }
                const { dependency } = _1.container.get(dependencyKey);
                if (dependency.type === _1.DependencyType.SERVICE) {
                    services.set(propertyName, dependency.value);
                }
                if (dependency.type === _1.DependencyType.ADAPTER) {
                    instances.set(propertyName, _1.container.getInstance(dependencyKey));
                }
                if (dependency.type === _1.DependencyType.CONSTANT) {
                    dependences[propertyName] = dependency.value;
                }
            });
        }
        if (services.size) {
            services.forEach((Dependence, key) => {
                dependences[key] = new Dependence(this.broker, baggage, this.options.cache);
            });
        }
        if (instances.size) {
            instances.forEach((instance, key) => {
                const trap = this.getTrap(instance, tracer, baggage);
                dependences[key] = new Proxy(instance, trap);
            });
        }
        return dependences;
    }
    /**
     * Create Method (business logic) context
     */
    createMethodContext(Method, dependencies) {
        const constructor = dependencies[_1.ConstructorDependencyKey] || [];
        const context = new Method(...constructor);
        for (const key in dependencies) {
            context[key] = dependencies[key];
        }
        return context;
    }
    /**
     * Create Baggage from span. Expired one-on-one business logic call
     */
    getNextBaggage(span, baggage) {
        const { traceId, spanId, traceFlags } = span.spanContext();
        return { traceId, spanId, traceFlags, expired: baggage === null || baggage === void 0 ? void 0 : baggage.expired };
    }
    /**
     * If there is no baggage. For example, in HTTP Gateway
     */
    getRootBaggage(subject, headers, ownTimeout) {
        const baggage = headers ? this.getBaggageFromHTTPHeader(headers) : undefined;
        const tracer = api_1.trace.getTracer('');
        const context = this.getContext(baggage);
        const span = tracer.startSpan(subject, undefined, context);
        const newBaggage = this.getNextBaggage(span, baggage);
        this.rootSpans.set(newBaggage.traceId, span);
        return {
            ...newBaggage,
            expired: this.getExpired(undefined, ownTimeout),
        };
    }
    /**
     * End root baggage
     */
    endRootSpan(traceId, error) {
        const span = this.rootSpans.get(traceId);
        if (span) {
            this.finishSpan(span, error);
            this.rootSpans.delete(traceId);
        }
    }
    buildService(Client, baggage) {
        return new Client(this.broker, baggage, this.options.cache, this.options.loggerOutputFormatter);
    }
    /**
     * Create service Method for send HTTP settings
     */
    async runServiceMethodForHttp() {
        const subject = `${this.serviceName}.${this.SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS}`;
        const subscription = this.broker.subscribe(subject, { queue: this.serviceName });
        this.subscriptions.push(subscription);
        for await (const message of subscription) {
            message.respond(this.buildMessage(this.getHttpSettings()));
        }
    }
    makeHttpSingleResponse(response, data) {
        const isError = !data.payload && data.error && data.error.message;
        const responseData = JSON.stringify(data);
        response
            .writeHead(isError ? 500 : 200, {
            'Content-Length': Buffer.byteLength(responseData),
            'Content-Type': 'application/json',
        })
            .write(responseData);
        response.end();
    }
    /**
     * Create transform stream for convert object to string in stream pipeline
     */
    getStringifyTransform() {
        return new node_stream_1.Transform({
            objectMode: true,
            transform(chunk, encoding, push) {
                try {
                    if (chunk instanceof Buffer) {
                        push(null, chunk);
                    }
                    else {
                        const result = JSON.stringify(chunk);
                        push(null, result);
                    }
                }
                catch (error) {
                    push(error);
                }
            },
        });
    }
    makeHttpStreamResponse(response, data) {
        data.payload.on('error', error => {
            this.logger.error(error);
        });
        response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
        });
        return (0, promises_1.pipeline)(data.payload, this.getStringifyTransform(), response);
    }
    /**
     *  Up HTTP server and start listen http routes
     */
    async buildHTTPHandlers() {
        await this.upHTTPServer();
        this.runServiceMethodForHttp();
        this.httpServer.on('request', async (request, response) => {
            var _a, _b, _c, _d;
            try {
                if (request.method !== 'POST' || !request.url) {
                    throw new Error('Wrong http request');
                }
                const parsedUrl = request.url.split('/');
                parsedUrl.shift();
                const [serviceName, action, ...other] = parsedUrl;
                const wrongServiceName = this.serviceName !== serviceName;
                const Method = this.httpMethods.get(action);
                if (other.length || wrongServiceName || !Method) {
                    throw new Error('Wrong url or service name or action');
                }
                const baggage = this.getBaggageFromHTTPHeader(request.headers);
                if ((_b = (_a = Method.settings.options) === null || _a === void 0 ? void 0 : _a.useStream) === null || _b === void 0 ? void 0 : _b.request) {
                    const result = await this.handled(request, Method, baggage);
                    if (Method.settings.options.useStream.response && result.payload instanceof node_stream_1.Readable) {
                        this.makeHttpStreamResponse(response, result);
                        return;
                    }
                    this.makeHttpSingleResponse(response, result);
                    return;
                }
                const requestDataRaw = [];
                for await (const data of request) {
                    requestDataRaw.push(data);
                }
                const requestData = Buffer.concat(requestDataRaw).toString();
                const result = await this.handled(JSON.parse(requestData), Method, baggage);
                if (((_d = (_c = Method.settings.options) === null || _c === void 0 ? void 0 : _c.useStream) === null || _d === void 0 ? void 0 : _d.response) && result.payload instanceof node_stream_1.Readable) {
                    await this.makeHttpStreamResponse(response, result);
                    return;
                }
                this.makeHttpSingleResponse(response, result);
            }
            catch (error) {
                this.logger.error(error);
                if (error instanceof Error) {
                    this.makeHttpSingleResponse(response, this.buildErrorMessage(error));
                    return;
                }
                this.makeHttpSingleResponse(response, this.buildErrorMessage('System unknown error'));
            }
        });
    }
    /**
     * Run business logic for request
     */
    async handled(payload, Method, baggage) {
        const subject = `${this.serviceName}.${Method.settings.action}`;
        const tracer = api_1.trace.getTracer('');
        const context = this.getContext(baggage);
        const span = tracer.startSpan(subject, undefined, context);
        const logger = new toolbelt_1.Logs.Logger({
            location: `${this.serviceName}.${Method.settings.action}`,
            metadata: baggage,
            outputFormatter: this.options.loggerOutputFormatter,
        });
        try {
            const requestedDependencies = this.createObjectWithDependencies(Method, tracer, this.getNextBaggage(span, baggage));
            const context = this.createMethodContext(Method, requestedDependencies);
            context['logger'] = logger;
            context['emitter'] = this.emitter;
            const response = await context.handler.call(context, payload);
            const result = {
                payload: response,
            };
            logger.debug({ request: payload, response });
            this.finishSpan(span);
            return result;
        }
        catch (error) {
            logger.debug({ request: payload });
            logger.error(this.createErrorMessageForLogger(error));
            this.finishSpan(span, error);
            return this.buildErrorMessage(error);
        }
    }
    /**
     * Make error object if error instance of Error object for logger
     */
    createErrorMessageForLogger(error) {
        if (error instanceof Error) {
            return { name: error.name, message: error.message, stack: error.stack };
        }
        return { message: JSON.stringify(error) };
    }
    /**
     * Start service. Subscribe for subject and up http server
     */
    async start() {
        var _a;
        const { methods } = this.options;
        try {
            methods.forEach(async (Method) => {
                var _a;
                if ((_a = Method.settings.options) === null || _a === void 0 ? void 0 : _a.useStream) {
                    this.httpMethods.set(Method.settings.action, Method);
                    return;
                }
                const subject = `${this.serviceName}.${Method.settings.action}`;
                const subscription = this.broker.subscribe(subject, { queue: this.serviceName });
                this.subscriptions.push(subscription);
                for await (const message of subscription) {
                    const { payload, baggage } = (0, nats_1.JSONCodec)().decode(message.data);
                    try {
                        const result = await this.handled(payload, Method, baggage);
                        message.respond(this.buildMessage(result));
                    }
                    catch (error) {
                        message.respond(this.buildMessage({ error: error.message }));
                    }
                }
            });
            if (this.httpMethods.size > 0) {
                await this.buildHTTPHandlers();
            }
            this.watchBrokerEvents();
            this.upProbeRoutes();
            this.registerGracefulShutdown();
            if ((_a = this.options.events) === null || _a === void 0 ? void 0 : _a.streamOptions) {
                const streamManager = new StreamManager_1.StreamManager({
                    broker: this.broker,
                    options: this.options.events.streamOptions,
                    serviceName: this.serviceName,
                    outputFormatter: this.options.loggerOutputFormatter,
                });
                await streamManager.createStreams();
            }
            this.logger.info('Service successfully started!');
        }
        catch (error) {
            if (error instanceof Error) {
                this.logger.error(error.name, error.message);
            }
            else {
                this.logger.error('An error occurred while starting the service', error);
            }
            process.exit(1);
        }
    }
    /**
     * Correct finish all connections
     */
    async cleanupAndExit() {
        var _a, _b, _c, _d;
        try {
            const timeout = ((_a = this.options.gracefulShutdown) === null || _a === void 0 ? void 0 : _a.timeout) || 1000;
            this.logger.info('Closing Broker connection');
            await Promise.race([this.broker.drain(), (0, promises_2.setTimeout)(timeout)]);
            if (this.httpServer) {
                this.logger.info('Closing HTTP server');
                const closeHttp = (0, node_util_1.promisify)(this.httpServer.close);
                await Promise.race([closeHttp, (0, promises_2.setTimeout)(timeout)]);
            }
            if ((_c = (_b = this.options.gracefulShutdown) === null || _b === void 0 ? void 0 : _b.additional) === null || _c === void 0 ? void 0 : _c.length) {
                this.logger.info('Closing additional services');
                for await (const service of (_d = this.options.gracefulShutdown) === null || _d === void 0 ? void 0 : _d.additional) {
                    await Promise.race([service.close(), (0, promises_2.setTimeout)(timeout)]);
                }
            }
            if (this.httpProbServer) {
                this.logger.info('Closing HTTP Prob server');
                const closeHttp = (0, node_util_1.promisify)(this.httpProbServer.close);
                await Promise.race([closeHttp, (0, promises_2.setTimeout)(timeout)]);
            }
        }
        catch (error) {
            this.logger.error('Fail correct finish service', error);
        }
        process.exit(0);
    }
    async stop() {
        await this.cleanupAndExit();
    }
    /**
     * Handler for OS Signal
     */
    handleSignal(signal) {
        return () => {
            this.logger.warn(`signal ${signal} received`);
            this.cleanupAndExit();
        };
    }
    /**
     * Handler for Force OS Signal
     */
    handleFatalError(message) {
        return (err) => {
            this.logger.error(message, err);
            process.exit(1);
        };
    }
    /**
     * Register listeners for Graceful Shutdown
     */
    registerGracefulShutdown() {
        process.on('SIGINT', this.handleSignal('SIGINT'));
        process.on('SIGQUIT', this.handleSignal('SIGQUIT'));
        process.on('SIGTERM', this.handleSignal('SIGTERM'));
        process.on('uncaughtException', this.handleFatalError('Uncaught exception'));
        process.on('unhandledRejection', this.handleFatalError('Unhandled rejection'));
    }
    /**
     * Up Probe Route for container orchestration service
     */
    upProbeRoutes() {
        if (this.httpProbServer || process.env.ENVIRONMENT === 'local') {
            return;
        }
        this.httpProbServer = http.createServer();
        this.httpProbServer.on('request', (request, response) => {
            if (request.url === '/healthcheck' && request.method === 'GET') {
                response.writeHead(200).end();
                return;
            }
            response.writeHead(500).end();
        });
        this.httpProbServer.listen(8081).once('error', error => {
            if (!this.broker.isUnion) {
                throw error;
            }
            this.httpProbServer = undefined;
        });
    }
    /**
     * Type guard for NATS debug event
     */
    isNATSDebugEvent(event) {
        return (event === nats_1.DebugEvents.PingTimer || event === nats_1.DebugEvents.Reconnecting || event === nats_1.DebugEvents.StaleConnection);
    }
    /**
     * Logs events from the broker
     */
    async watchBrokerEvents() {
        for await (const event of this.broker.status()) {
            if (this.isNATSDebugEvent(event.type)) {
                this.logger.debug(`${event.type}: ${event.data}`);
                return;
            }
            this.logger.warn(`${event.type}: ${event.data}`);
        }
    }
    /**
     * Build message for broker
     */
    buildMessage(message) {
        return (0, nats_1.JSONCodec)().encode(message);
    }
    async upHTTPServer() {
        this.httpServer = http.createServer();
        this.ipAddress = this.getMyIpV4();
        this.httpPort = await new Promise((resolve, reject) => {
            this.httpServer = this.httpServer.listen(0, () => {
                const address = this.httpServer.address();
                if (!address) {
                    reject(new Error('Failed to get the port number: server is not listening'));
                    return;
                }
                if (typeof address === 'string') {
                    reject(new Error('Listening on a unix socket is not supported'));
                    return;
                }
                resolve(address.port);
            });
        });
        console.log('upHTTPServer, addressm port', this.ipAddress, this.httpPort);
        return this.httpServer;
    }
    getMyIpV4() {
        const networkInterfaces = os.networkInterfaces();
        const myIpV4Address = Object.keys(networkInterfaces).reduce((ip, key) => {
            if (ip) {
                return ip;
            }
            const networkInterface = networkInterfaces[key];
            const externalIpV4Interface = networkInterface === null || networkInterface === void 0 ? void 0 : networkInterface.find(item => item.internal && item.family === 'IPv4');
            if (externalIpV4Interface) {
                return externalIpV4Interface.address;
            }
            return ip;
        }, '');
        if (!myIpV4Address) {
            throw new Error('Failed to get service ip address');
        }
        return myIpV4Address;
    }
    getHttpSettings() {
        return {
            ip: this.ipAddress,
            port: this.httpPort,
        };
    }
    getBaggageFromHTTPHeader(headers) {
        const expired = headers['nsc-expired'] ? +headers['nsc-expired'] : undefined;
        const traceId = headers['nsc-trace-id'];
        const spanId = headers['nsc-span-id'];
        const traceFlags = headers['nsc-trace-flags'] ? +headers['nsc-trace-flags'] : undefined;
        if (traceId && spanId && traceFlags) {
            return {
                traceId,
                spanId,
                traceFlags,
                expired,
            };
        }
        return undefined;
    }
}
exports.Service = Service;
//# sourceMappingURL=Service.js.map