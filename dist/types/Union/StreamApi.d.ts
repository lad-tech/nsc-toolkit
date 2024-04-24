import { Lister, MsgRequest, PurgeOpts, PurgeResponse, StoredMsg, StreamAPI, StreamConfig, StreamInfo, StreamInfoRequestOptions, StreamUpdateConfig } from 'nats/lib/nats-base-client/types';
export declare class StreamApiBlank implements StreamAPI {
    info(stream: string, opts?: Partial<StreamInfoRequestOptions>): Promise<StreamInfo>;
    add(cfg: Partial<StreamConfig>): Promise<StreamInfo>;
    update(name: string, cfg: Partial<StreamUpdateConfig>): Promise<StreamInfo>;
    purge(stream: string, opts?: PurgeOpts): Promise<PurgeResponse>;
    delete(stream: string): Promise<boolean>;
    list(): Lister<StreamInfo>;
    deleteMessage(stream: string, seq: number, erase?: boolean): Promise<boolean>;
    getMessage(stream: string, query: MsgRequest): Promise<StoredMsg>;
    find(subject: string): Promise<string>;
}
