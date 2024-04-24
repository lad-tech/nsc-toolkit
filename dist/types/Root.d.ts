import { Logs } from '@lad-tech/toolbelt';
import * as opentelemetry from '@opentelemetry/api';
import type { NatsConnection } from 'nats';
import type { Baggage } from './interfaces';
import { Broker } from './Union';
export declare class Root {
    protected readonly SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS = "get_http_settings";
    protected readonly CACHE_SERVICE_KEY = "CACHE";
    protected readonly SUBJECT_DELIMITER = ".";
    protected logger: Logs.Logger;
    broker: Broker;
    constructor(broker?: NatsConnection, outputFormatter?: Logs.OutputFormatter);
    protected castToNumber(value?: string): number;
    protected getSettingFromEnv(name: string, required?: boolean): string | undefined;
    /**
     * Make opentelemetry context from baggagge
     */
    protected getContext(baggage?: Baggage): opentelemetry.Context | undefined;
    protected getExpired(expired?: number, ownTimeout?: number): number;
    protected buildErrorMessage(error: string | Error | Record<any, any>, code?: number): {
        payload: null;
        error: {
            message: string;
            code: number | undefined;
        };
    };
}
