import { Root } from './Root';
import { JSONCodec, Subscription, DebugEvents, Events, headers, MsgHdrs } from 'nats';
import {
  Message,
  Emitter,
  Method,
  ServiceOptions,
  Baggage,
  ExternalBaggage,
  ClientService,
  DependencyType,
  container,
  InstanceContainer,
  ServiceContainer,
  Dependency,
  Instance,
  dependencyStorageMetaKey,
  ConstructorDependencyKey,
  Tag,
} from '.';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Tracer, Context, Span, trace, SpanKind } from '@opentelemetry/api';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { IncomingHttpHeaders, ServerResponse } from 'node:http';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Logs } from '@lad-tech/toolbelt';
import * as http from 'node:http';
import * as os from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { StreamManager } from './StreamManager';

export class Service<E extends Emitter = Emitter> extends Root {
  public emitter = {} as E;
  private serviceName: string;
  private httpServer?: http.Server;
  private httpProbServer?: http.Server;
  protected httpPort?: number;
  protected ipAddress?: string;
  private subscriptions: Subscription[] = [];
  private httpMethods = new Map<string, Method>();
  private rootSpans = new Map<string, Span>();

  /**
   * Unique identifier NATS header for a message that will be used by the server apply
   * de-duplication within the configured Duplicate Window
   */
  private readonly UNIQ_ID_HEADER = 'Nats-Msg-Id';
  /**
   * Nats-Rollup header indicating all prior messages should be purged
   */
  private readonly ROLLUP_HEADER = 'Nats-Rollup';
  /**
   * Roll-up only same subject message in the stream
   */
  private readonly ROLLUP_STRATEGY = 'sub';
  private readonly BASE_EVENT_SUFFIX = 'base';

  constructor(private options: ServiceOptions<E>) {
    super(options.brokerConnection, options.loggerOutputFormatter);

    this.serviceName = options.name;
    this.logger.setLocation(this.serviceName);
    if (options.events) {
      const events = Object.keys(options.events.list) as [keyof E];
      this.emitter = events.reduce((result, eventName) => {
        result[eventName] = ((params: unknown, uniqId?: string, rollupId?: string, external?: ExternalBaggage) => {
          const subject: string[] = [options.name];

          const eventOptions = options.events?.list[eventName];
          const isStream = eventOptions?.options?.stream;

          if (isStream) {
            const prefix = options.events?.streamOptions.prefix;

            if (!prefix) {
              throw new Error(`Stream prefix not set for event ${String(eventName)} marked as stream`);
            }

            subject.push(prefix);
          }

          subject.push(String(eventName));

          let settings: { headers: MsgHdrs } | undefined;
          if (uniqId) {
            settings = { headers: headers() };
            settings.headers.append(this.UNIQ_ID_HEADER, uniqId);
          }
          if (rollupId && isStream) {
            settings = settings ?? { headers: headers() };
            settings.headers.append(this.ROLLUP_HEADER, this.ROLLUP_STRATEGY);
            subject.push(rollupId);
          } else if (rollupId && !isStream) {
            this.logger.warn(`${String(eventName)}. Rollup is available only for streams`);
          } else if (isStream) {
            subject.push(this.BASE_EVENT_SUFFIX);
          }

          if (external) {
            const baggage = this.getBaggageFromExternalHeader(external);
            const tracer = trace.getTracer('');
            const context = this.getContext(this.isBaggageContainTrace(baggage) ? baggage : undefined);
            const span = tracer.startSpan(String(eventName), { kind: SpanKind.PRODUCER }, context);
            const eventSpanContext = span.spanContext();
            const eventHeader = this.convertBaggaggeToExternalHeader(eventSpanContext);

            if (!settings) {
              settings = { headers: headers() };
            }
            for (const [key, value] of Object.entries(eventHeader)) {
              settings.headers.append(key, `${value}`);
            }

            span.end();
          }

          this.broker.publish(subject.join('.'), this.buildMessage(params), settings);
        }) as E[keyof E];
        return result;
      }, this.emitter);
    }
    this.createTracer();
  }

  /**
   * Create global Tracer
   */
  private createTracer() {
    const provider = new BasicTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.options.name,
      }),
    });

    let host: string | undefined;
    let port: number | undefined;

    const agentUrl = this.getSettingFromEnv('OTEL_AGENT', false);

    if (agentUrl) {
      const agent = agentUrl.split(':');
      host = agent[0];
      port = parseInt(agent[1]) || undefined;
    }

    const exporter = new JaegerExporter({ host, port });
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  }

  private finishSpan(span: Span, error?: Error, tag?: Tag) {
    if (error) {
      span.setAttribute('error', true);
      span.setAttribute('error.kind', error.message);
    }

    this.applyTag(span, tag);

    span.end();
  }

  /**
   * Wrapper for async methods. Create span
   */
  private perform(
    func: (...args: unknown[]) => Promise<unknown>,
    funcContext: unknown,
    arg: unknown[],
    tracer: Tracer,
    context?: Context,
    tag?: Tag,
  ) {
    const span = tracer.startSpan(func.name, undefined, context);
    try {
      const result = func.apply(funcContext, arg);
      if (result.then) {
        return result.then(
          (result: any) => {
            this.finishSpan(span, undefined, tag);
            return result;
          },
          (error: Error) => {
            this.finishSpan(span, error, tag);
            throw error;
          },
        );
      }
      this.finishSpan(span, undefined, tag);
      return result;
    } catch (error) {
      this.finishSpan(span, error, tag);
      throw error;
    }
  }

  /**
   * Build trap for object with async methods
   */
  private getTrap(instance: Instance, tracer: Tracer, baggage?: Baggage, tag?: Tag) {
    const perform = this.perform.bind(this);
    const context = this.getContext(baggage);
    return {
      get(target: any, propKey: string, receiver: any) {
        const method = Reflect.get(target, propKey, receiver);
        if (typeof method === 'function') {
          return function (...args: unknown[]) {
            return perform(method, instance, args, tracer, context, tag);
          };
        } else {
          return method;
        }
      },
    };
  }

  /**
   * Creating an object to inject into Method (business logic)
   */
  private createObjectWithDependencies(method: Method, tracer: Tracer, baggage?: Baggage) {
    const services = ServiceContainer.get(method.settings.action) || new Map<string, Dependency>();
    const instances = InstanceContainer.get(method.settings.action) || new Map<string, Instance>();
    const tags = new Map<string, Tag>();

    const dependences: Record<string, any> = { [ConstructorDependencyKey]: [] };

    const dependencyStorage: Map<string, symbol | symbol[]> | undefined = Reflect.getMetadata(
      dependencyStorageMetaKey,
      method,
    );

    if (dependencyStorage && dependencyStorage.size) {
      // for constructor
      dependencyStorage.forEach((dependencyKey, propertyName) => {
        if (Array.isArray(dependencyKey)) {
          if (propertyName === ConstructorDependencyKey) {
            dependencyKey.forEach((item, index) => {
              const { dependency } = container.get(item);
              if (dependency.type === DependencyType.SERVICE) {
                dependences[ConstructorDependencyKey][index] = new (dependency.value as Dependency)(
                  this.broker,
                  baggage,
                  this.options.cache,
                );
              }
              if (dependency.type === DependencyType.ADAPTER) {
                const instance = container.getInstance(item);
                const trap = this.getTrap(instance, tracer, baggage);
                dependences[ConstructorDependencyKey][index] = new Proxy(instance, trap);
              }
              if (dependency.type === DependencyType.CONSTANT) {
                dependences[ConstructorDependencyKey][index] = dependency.value;
              }
            });
          }
          return;
        }

        const { dependency } = container.get(dependencyKey);

        if (dependency.type === DependencyType.SERVICE) {
          services.set(propertyName, dependency.value as Dependency);
        }

        if (dependency.type === DependencyType.ADAPTER) {
          instances.set(propertyName, container.getInstance(dependencyKey));
          if (dependency.options?.tag) {
            tags.set(propertyName, dependency.options.tag);
          }
        }

        if (dependency.type === DependencyType.CONSTANT) {
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
        const trap = this.getTrap(instance, tracer, baggage, tags.get(key));
        dependences[key] = new Proxy(instance, trap);
      });
    }

    return dependences;
  }

  /**
   * Create Method (business logic) context
   */
  private createMethodContext(Method: Method, dependencies: Record<string, unknown>) {
    const constructor = (dependencies[ConstructorDependencyKey] as Array<unknown>) || [];
    const context = new Method(...constructor);
    for (const key in dependencies) {
      context[key] = dependencies[key];
    }
    return context;
  }

  /**
   * Create Baggage from span. Expired one-on-one business logic call
   */
  private getNextBaggage(span: Span, baggage?: Pick<Baggage, 'expired' | 'requestId'>) {
    const { traceId, spanId, traceFlags } = span.spanContext();
    return { traceId, spanId, traceFlags, expired: baggage?.expired, requestId: baggage?.requestId };
  }

  /**
   * Guard for determine whether baggage contains trace information
   */
  private isBaggageContainTrace(params: Partial<Baggage> | undefined): params is Baggage {
    return !!params && !!((params as Baggage).traceId && (params as Baggage).spanId && (params as Baggage).traceFlags);
  }

  /**
   * If there is no baggage. For example, in HTTP Gateway
   */
  public getRootBaggage(subject: string, headers?: ExternalBaggage, ownTimeout?: number) {
    const baggage = headers ? this.getBaggageFromExternalHeader(headers) : undefined;
    const tracer = trace.getTracer('');
    const context = this.getContext(this.isBaggageContainTrace(baggage) ? baggage : undefined);
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
  public endRootSpan(traceId: string, error?: Error) {
    const span = this.rootSpans.get(traceId);
    if (span) {
      this.finishSpan(span, error);
      this.rootSpans.delete(traceId);
    }
  }

  public buildService<C extends ClientService>(Client: C, baggage?: Baggage) {
    return new Client(this.broker, baggage, this.options.cache, this.options.loggerOutputFormatter) as InstanceType<C>;
  }

  /**
   * Create service Method for send HTTP settings
   */
  private async runServiceMethodForHttp() {
    const subject = `${this.serviceName}.${this.SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS}`;
    const subscription = this.broker.subscribe(subject, { queue: this.serviceName });
    this.subscriptions.push(subscription);
    for await (const message of subscription) {
      message.respond(this.buildMessage(this.getHttpSettings()));
    }
  }

  private makeHttpSingleResponse(response: ServerResponse, data: Message) {
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
  private getStringifyTransform() {
    return new Transform({
      objectMode: true,
      transform(chunk, encoding, push) {
        try {
          if (chunk instanceof Buffer) {
            push(null, chunk);
          } else {
            const result = JSON.stringify(chunk);
            push(null, result);
          }
        } catch (error) {
          push(error);
        }
      },
    });
  }

  private makeHttpStreamResponse(response: ServerResponse, data: Message<Readable>) {
    data.payload.on('error', error => {
      this.logger.error(error);
    });
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
    });
    return pipeline(data.payload, this.getStringifyTransform(), response);
  }

  /**
   *  Up HTTP server and start listen http routes
   */
  private async buildHTTPHandlers() {
    await this.upHTTPServer();
    this.runServiceMethodForHttp();
    this.httpServer!.on('request', async (request, response) => {
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
        const baggage = this.getBaggageFromExternalHeader(request.headers as IncomingHttpHeaders & ExternalBaggage);
        if (Method.settings.options?.useStream?.request) {
          const result = await this.handled(request, Method, baggage);
          if (Method.settings.options.useStream.response && result.payload instanceof Readable) {
            this.makeHttpStreamResponse(response, result as Message<Readable>);
            return;
          }
          this.makeHttpSingleResponse(response, result);
          return;
        }
        const requestDataRaw: Buffer[] = [];
        for await (const data of request) {
          requestDataRaw.push(data);
        }
        const requestData = Buffer.concat(requestDataRaw).toString();
        const result = await this.handled(JSON.parse(requestData), Method, baggage);
        if (Method.settings.options?.useStream?.response && result.payload instanceof Readable) {
          await this.makeHttpStreamResponse(response, result as Message<Readable>);
          return;
        }
        this.makeHttpSingleResponse(response, result);
      } catch (error: unknown) {
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
  private async handled(payload: unknown, Method: Method, baggage?: Partial<Baggage>): Promise<Message> {
    const subject = `${this.serviceName}.${Method.settings.action}`;
    const tracer = trace.getTracer('');

    const context = this.getContext(this.isBaggageContainTrace(baggage) ? baggage : undefined);
    const span = tracer.startSpan(subject, undefined, context);

    const logger = new Logs.Logger({
      location: `${this.serviceName}.${Method.settings.action}`,
      metadata: baggage,
      outputFormatter: this.options.loggerOutputFormatter,
    });

    const nextBaggage = this.getNextBaggage(span, baggage);

    try {
      const requestedDependencies = this.createObjectWithDependencies(Method, tracer, nextBaggage);
      const context = this.createMethodContext(Method, requestedDependencies);

      context['logger'] = logger;
      context['emitter'] = this.getWrappedEmitter(nextBaggage);

      const response = await context.handler.call(context, payload);
      const result = {
        payload: response,
      };
      logger.debug({ request: payload, response });
      this.finishSpan(span);
      return result;
    } catch (error) {
      logger.debug({ request: payload });
      logger.error(this.createErrorMessageForLogger(error));
      this.finishSpan(span, error);
      return this.buildErrorMessage(error);
    }
  }

  /**
   * Wrap emitter for luggage baggagge
   */
  private getWrappedEmitter(baggage?: Partial<Baggage>): E {
    if (!baggage) {
      return this.emitter;
    }

    const externalBaggage = this.convertBaggaggeToExternalHeader(baggage);

    return new Proxy(this.emitter, {
      get(target: any, propKey: string, receiver: any) {
        const event = Reflect.get(target, propKey, receiver);
        if (typeof event === 'function') {
          return (params: unknown, uniqId?: string, rollupId?: string, userExternalBaggage?: ExternalBaggage) => {
            return event(params, uniqId, rollupId, userExternalBaggage ?? externalBaggage);
          };
        } else {
          return event;
        }
      },
    });
  }

  /**
   * Make error object if error instance of Error object for logger
   */
  private createErrorMessageForLogger(error: any) {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: JSON.stringify(error) };
  }

  /**
   * Start service. Subscribe for subject and up http server
   */
  public async start() {
    const { methods } = this.options;
    try {
      methods.forEach(async Method => {
        if (Method.settings.options?.useStream) {
          this.httpMethods.set(Method.settings.action, Method);
          return;
        }

        const subject = `${this.serviceName}.${Method.settings.action}`;

        const subscription = this.broker.subscribe(subject, { queue: this.serviceName });
        this.subscriptions.push(subscription);
        for await (const message of subscription) {
          const { payload, baggage } = JSONCodec<Message<unknown>>().decode(message.data);
          this.handled(payload, Method, baggage)
            .then(result => {
              message.respond(this.buildMessage(result));
            })
            .catch(error => {
              message.respond(this.buildMessage({ error: error.message }));
            });
        }
      });

      if (this.httpMethods.size > 0) {
        await this.buildHTTPHandlers();
      }

      this.watchBrokerEvents();
      this.upProbeRoutes();
      this.registerGracefulShutdown();

      if (this.options.events?.streamOptions) {
        const streamManager = new StreamManager({
          broker: this.broker,
          options: this.options.events.streamOptions,
          serviceName: this.serviceName,
          outputFormatter: this.options.loggerOutputFormatter,
        });
        await streamManager.createStreams();
      }

      this.logger.info('Service successfully started!');
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(error.name, error.message);
      } else {
        this.logger.error('An error occurred while starting the service', error);
      }
      process.exit(1);
    }
  }

  /**
   * Correct finish all connections
   */
  private async cleanupAndExit() {
    try {
      const timeout = this.options.gracefulShutdown?.timeout || 1000;
      this.logger.info('Closing Broker connection');
      await Promise.race([this.broker.drain(), setTimeout(timeout)]);

      if (this.httpServer) {
        this.logger.info('Closing HTTP server');
        const closeHttp = promisify(this.httpServer.close);
        await Promise.race([closeHttp, setTimeout(timeout)]);
      }

      if (this.options.gracefulShutdown?.additional?.length) {
        this.logger.info('Closing additional services');
        for await (const service of this.options.gracefulShutdown?.additional) {
          await Promise.race([service.close(), setTimeout(timeout)]);
        }
      }

      if (this.httpProbServer) {
        this.logger.info('Closing HTTP Prob server');
        const closeHttp = promisify(this.httpProbServer.close);
        await Promise.race([closeHttp, setTimeout(timeout)]);
      }
    } catch (error) {
      this.logger.error('Fail correct finish service', error);
    }

    process.exit(0);
  }

  public async stop() {
    await this.cleanupAndExit();
  }

  /**
   * Handler for OS Signal
   */
  private handleSignal(signal: string) {
    return () => {
      this.logger.warn(`signal ${signal} received`);
      this.cleanupAndExit();
    };
  }

  /**
   * Handler for Force OS Signal
   */
  private handleFatalError(message: string) {
    return (err: any) => {
      this.logger.error(message, err);
      process.exit(1);
    };
  }

  /**
   * Register listeners for Graceful Shutdown
   */
  private registerGracefulShutdown() {
    process.on('SIGINT', this.handleSignal('SIGINT'));
    process.on('SIGQUIT', this.handleSignal('SIGQUIT'));
    process.on('SIGTERM', this.handleSignal('SIGTERM'));
    process.on('uncaughtException', this.handleFatalError('Uncaught exception'));
    process.on('unhandledRejection', this.handleFatalError('Unhandled rejection'));
  }

  /**
   * Up Probe Route for container orchestration service
   */
  private upProbeRoutes() {
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
  private isNATSDebugEvent(event: Events | DebugEvents): event is DebugEvents {
    return (
      event === DebugEvents.PingTimer || event === DebugEvents.Reconnecting || event === DebugEvents.StaleConnection
    );
  }

  /**
   * Logs events from the broker
   */
  private async watchBrokerEvents() {
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
  private buildMessage(message: unknown) {
    return JSONCodec().encode(message);
  }

  private async upHTTPServer() {
    this.httpServer = http.createServer();
    this.ipAddress = this.getMyIpV4();
    this.httpPort = await new Promise((resolve, reject) => {
      this.httpServer = this.httpServer!.listen(0, () => {
        const address = this.httpServer!.address();

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
    return this.httpServer!;
  }

  private getMyIpV4() {
    const networkInterfaces = os.networkInterfaces();
    const myIpV4Address = Object.keys(networkInterfaces).reduce((ip, key) => {
      if (ip) {
        return ip;
      }
      const networkInterface = networkInterfaces[key];
      const externalIpV4Interface = networkInterface?.find(item => !item.internal && item.family === 'IPv4');
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

  private getHttpSettings() {
    return {
      ip: this.ipAddress,
      port: this.httpPort,
    };
  }

  private getBaggageFromExternalHeader(headers: ExternalBaggage) {
    const expired = headers['nsc-expired'] ? +headers['nsc-expired'] : undefined;
    const traceId = headers['nsc-trace-id'];
    const spanId = headers['nsc-span-id'];
    const traceFlags = headers['nsc-trace-flags'] ? +headers['nsc-trace-flags'] : undefined;
    const requestId = headers['x-request-id'] ? String(headers['x-request-id']) : undefined;

    if (traceId && spanId && traceFlags) {
      return {
        traceId,
        spanId,
        traceFlags,
        expired,
        requestId,
      };
    }
    return { expired, requestId };
  }
}
