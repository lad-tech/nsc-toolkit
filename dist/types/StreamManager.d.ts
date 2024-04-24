import { StreamManagerParam, GetListenerOptions } from '.';
import { JetStreamSubscription } from 'nats';
import { Root } from './Root';
export declare class StreamManager extends Root {
    private param;
    private readonly STAR_WILDCARD;
    private readonly GREATER_WILDCARD;
    private readonly TWO_WEEKS_IN_SECOND;
    private readonly ONE_DAY_IN_SECOND;
    private readonly defaultStreamOption;
    private jsm?;
    constructor(param: StreamManagerParam);
    createStreams(): Promise<void>;
    createConsumer(serviceNameFrom: string, eventName: string, setting?: GetListenerOptions): Promise<JetStreamSubscription>;
    private getStreamName;
    private isNotFoundStreamError;
    private buildPrefixForStreamName;
    private capitalizeFirstLetter;
    private convertSecondsToNanoseconds;
}
