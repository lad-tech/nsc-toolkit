import { Root } from './Root';
import { Emitter, ServiceOptions, Baggage, ExternalBaggage, ClientService } from '.';
export declare class Service<E extends Emitter = Emitter> extends Root {
    private options;
    emitter: E;
    private serviceName;
    private httpServer?;
    private httpProbServer?;
    protected httpPort?: number;
    protected ipAddress?: string;
    private subscriptions;
    private httpMethods;
    private rootSpans;
    constructor(options: ServiceOptions<E>);
    /**
     * Create global Tracer
     */
    private createTracer;
    private finishSpan;
    /**
     * Wrapper for async methods. Create span
     */
    private perform;
    /**
     * Build trap for object with async methods
     */
    private getTrap;
    /**
     * Creating an object to inject into Method (business logic)
     */
    private createObjectWithDependencies;
    /**
     * Create Method (business logic) context
     */
    private createMethodContext;
    /**
     * Create Baggage from span. Expired one-on-one business logic call
     */
    private getNextBaggage;
    /**
     * If there is no baggage. For example, in HTTP Gateway
     */
    getRootBaggage(subject: string, headers?: ExternalBaggage, ownTimeout?: number): {
        expired: number;
        traceId: string;
        spanId: string;
        traceFlags: number;
    };
    /**
     * End root baggage
     */
    endRootSpan(traceId: string, error?: Error): void;
    buildService<C extends ClientService>(Client: C, baggage?: Baggage): InstanceType<C>;
    /**
     * Create service Method for send HTTP settings
     */
    private runServiceMethodForHttp;
    private makeHttpSingleResponse;
    /**
     * Create transform stream for convert object to string in stream pipeline
     */
    private getStringifyTransform;
    private makeHttpStreamResponse;
    /**
     *  Up HTTP server and start listen http routes
     */
    private buildHTTPHandlers;
    /**
     * Run business logic for request
     */
    private handled;
    /**
     * Make error object if error instance of Error object for logger
     */
    private createErrorMessageForLogger;
    /**
     * Start service. Subscribe for subject and up http server
     */
    start(): Promise<void>;
    /**
     * Correct finish all connections
     */
    private cleanupAndExit;
    stop(): Promise<void>;
    /**
     * Handler for OS Signal
     */
    private handleSignal;
    /**
     * Handler for Force OS Signal
     */
    private handleFatalError;
    /**
     * Register listeners for Graceful Shutdown
     */
    private registerGracefulShutdown;
    /**
     * Up Probe Route for container orchestration service
     */
    private upProbeRoutes;
    /**
     * Type guard for NATS debug event
     */
    private isNATSDebugEvent;
    /**
     * Logs events from the broker
     */
    private watchBrokerEvents;
    /**
     * Build message for broker
     */
    private buildMessage;
    private upHTTPServer;
    private getMyIpV4;
    private getHttpSettings;
    private getBaggageFromHTTPHeader;
}
