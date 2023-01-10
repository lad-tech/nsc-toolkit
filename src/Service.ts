import { Root } from './Root';
import { JSONCodec, Subscription } from 'nats';
import { Message, Emitter, Method, ServiceOptions, Baggage, ExternalBaggage, ClientService } from './interfaces';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Tracer, Context, Span, trace } from '@opentelemetry/api';
import { InstanceContainer, ServiceContainer } from './injector';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { IncomingHttpHeaders, ServerResponse } from 'http';
import { Readable, Transform, pipeline } from 'stream';
import { Logs } from '@lad-tech/toolbelt';
import * as http from 'http';
import * as os from 'os';
import { setTimeout } from 'timers/promises';
import { promisify } from 'util';
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

  constructor(private options: ServiceOptions<E>) {
    super(options.brokerConnection, options.loggerOutputFormatter);

    this.serviceName = options.name;
    this.logger.setLocation(this.serviceName);
    if (options.events) {
      const events = Object.keys(options.events.list) as [keyof E];
      this.emitter = events.reduce((result, eventName) => {
        result[eventName] = ((params: unknown) => {
          const subject: string[] = [options.name];

          const eventOptions = options.events?.list[eventName];

          if (eventOptions?.options?.stream) {
            const prefix = options.events?.streamOptions.prefix;

            if (!prefix) {
              throw new Error(`Stream prefix not set for event ${String(eventName)} marked as stream`);
            }

            subject.push(prefix);
          }

          subject.push(String(eventName));

          this.brocker.publish(subject.join('.'), this.buildMessage(params));
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
    const exporter = new JaegerExporter({
      endpoint: this.getSettingFromEnv('OTEL_AGENT', false),
    });
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  }

  /**
   * Wrapper for async methods. Create span
   */
  private async perform(
    func: (...args: unknown[]) => Promise<unknown>,
    funcContext: unknown,
    arg: unknown[],
    tracer: Tracer,
    context?: Context,
  ) {
    const span = tracer.startSpan(func.name, undefined, context);
    const query = func.apply(funcContext, arg);
    query
      .then(() => span.end())
      .catch(error => {
        span.setAttribute('error', true);
        span.setAttribute('error.kind', error);
        span.end();
        throw error;
      });
    return query;
  }

  /**
   * Creating an object to inject into Method (business logic)
   */
  private createObjectWithDependencies(action: string, tracer: Tracer, baggage?: Baggage) {
    const services = ServiceContainer.get(action);
    const dependences: Record<string, unknown> = {};
    if (services?.size) {
      services.forEach((Dependence, key) => {
        dependences[key] = new Dependence(this.brocker, baggage, this.options.cache);
      });
    }
    const perform = this.perform;
    const context = this.getContext(baggage);
    const instances = InstanceContainer.get(action);
    if (instances?.size) {
      instances.forEach((instance, key) => {
        const trap = {
          get(target: any, propKey: string, receiver: any) {
            const method = Reflect.get(target, propKey, receiver);
            if (typeof method === 'function') {
              return function (...args: unknown[]) {
                return perform(method, instance, args, tracer, context);
              };
            } else {
              return method;
            }
          },
        };
        dependences[key] = new Proxy(instance, trap);
      });
    }

    dependences['logger'] = new Logs.Logger({
      location: `${this.serviceName}.${action}`,
      metadata: baggage,
      outputFormatter: this.options.loggerOutputFormatter,
    });
    return dependences;
  }

  /**
   * Create Method (business logic) context
   */
  private createMethodContext(Method: Method, dependencies: Record<string, unknown>) {
    const context = new Method();
    for (const key in dependencies) {
      context[key] = dependencies[key];
    }
    context['emitter'] = this.emitter;
    return context;
  }

  /**
   * Create Baggage from span. Expired one-on-one business logic call
   */
  private getNextBaggage(span: Span, baggage?: Baggage) {
    const { traceId, spanId, traceFlags } = span.spanContext();
    return { traceId, spanId, traceFlags, expired: baggage?.expired };
  }

  /**
   * If there is no baggage. For example, in HTTP Gateway
   */
  public getRootBaggage(subject: string, headers?: ExternalBaggage, ownTimeout?: number) {
    const baggage = headers ? this.getBaggageFromHTTPHeader(headers) : undefined;
    const tracer = trace.getTracer('');
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
  public endRootSpan(traceId: string, error?: Error) {
    const span = this.rootSpans.get(traceId);
    if (span) {
      if (error) {
        span.setAttribute('error', true);
        span.setAttribute('error.kind', error.message);
      }
      span.end();
      this.rootSpans.delete(traceId);
    }
  }

  public buildService<C extends ClientService>(Client: C, baggage?: Baggage) {
    return new Client(this.brocker, baggage, this.options.cache, this.options.loggerOutputFormatter) as InstanceType<C>;
  }

  /**
   * Create service Method for send HTTP settings
   */
  private async runServiceMethodForHttp() {
    const subject = `${this.serviceName}.${this.SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS}`;
    const subscription = this.brocker.subscribe(subject, { queue: this.serviceName });
    this.subscriptions.push(subscription);
    for await (const message of subscription) {
      message.respond(this.buildMessage(this.getHttpSettings()));
    }
  }

  private makeHttpSingleResponse(response: ServerResponse, data: Message) {
    const responseData = JSON.stringify(data);
    response
      .writeHead(200, {
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
          }
          const result = JSON.stringify(chunk);
          push(null, result);
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
    pipeline(data.payload, this.getStringifyTransform(), response, () => {});
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
        const baggage = this.getBaggageFromHTTPHeader(request.headers as IncomingHttpHeaders & ExternalBaggage);

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
          this.makeHttpStreamResponse(response, result as Message<Readable>);
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
  private async handled(payload: unknown, Method: Method, baggage?: Baggage): Promise<Message> {
    const subject = `${this.serviceName}.${Method.settings.action}`;
    const tracer = trace.getTracer('');

    const context = this.getContext(baggage);
    const span = tracer.startSpan(subject, undefined, context);

    try {
      const requestedDependencies = this.createObjectWithDependencies(
        Method.settings.action,
        tracer,
        this.getNextBaggage(span, baggage),
      );
      const context = this.createMethodContext(Method, requestedDependencies);
      const result = {
        payload: await context.handler.call(context, payload),
      };
      span.end();
      return result;
    } catch (error) {
      this.logger.error(error);
      span.setAttribute('error', true);
      span.setAttribute('error.kind', error);
      span.end();
      return this.buildErrorMessage(error);
    }
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

        const subscription = this.brocker.subscribe(subject, { queue: this.serviceName });
        this.subscriptions.push(subscription);
        for await (const message of subscription) {
          const { payload, baggage } = JSONCodec<Message<unknown>>().decode(message.data);
          try {
            const result = await this.handled(payload, Method, baggage);
            message.respond(this.buildMessage(result));
          } catch (error) {
            message.respond(this.buildMessage({ error: error.message }));
          }
        }
      });

      if (this.httpMethods.size > 0) {
        await this.buildHTTPHandlers();
      }

      // this.upProbeRoutes();
      this.registerGracefulShutdown();

      if (this.options.events?.streamOptions) {
        const streamManager = new StreamManager({
          broker: this.brocker,
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
      await Promise.race([this.options.brokerConnection.drain(), setTimeout(timeout)]);

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
    if (this.httpProbServer) {
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

    this.httpProbServer.listen(8081);
  }

  /**
   * Build message for broker
   */
  private buildMessage(message: unknown) {
    return Buffer.from(JSON.stringify(message));
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

  private getBaggageFromHTTPHeader(headers: ExternalBaggage) {
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
