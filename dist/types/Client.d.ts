/// <reference types="node" />
import { Readable } from 'node:stream';
import { ClientParam, Emitter, GetListenerOptions, Listener, MethodSettings } from './interfaces';
import { Root } from './Root';
type RequestData = Record<string, unknown> | Readable;
export declare class Client<E extends Emitter = Emitter> extends Root {
    private serviceName;
    private baggage?;
    private cache?;
    private events?;
    private Ref?;
    private subscriptions;
    private REQUEST_HTTP_SETTINGS_TIMEOUT;
    constructor({ broker, events, loggerOutputFormatter, serviceName, baggage, cache, Ref }: ClientParam<E>);
    private startWatch;
    /**
     * Make listener for service events. Auto subscribe and unsubscribe to subject
     */
    getListener<A extends keyof E>(serviceNameFrom: string, options?: GetListenerOptions): Listener<E>;
    private createCacheKey;
    private validate;
    protected request<R = any, P extends RequestData = RequestData>(subject: string, data: P, { options, request, response }: MethodSettings): Promise<R>;
    private getHTTPSettingsFromRemoteService;
    private isStream;
    private makeBrokerRequest;
    private makeHttpRequest;
    private convertBaggaggeToExternalHeader;
    private isJsMessage;
}
export {};
