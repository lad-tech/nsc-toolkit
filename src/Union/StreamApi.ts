import {
  Lister,
  MsgRequest,
  PurgeOpts,
  PurgeResponse,
  StoredMsg,
  StreamAPI,
  StreamConfig,
  StreamInfo,
  StreamInfoRequestOptions,
  StreamUpdateConfig,
} from 'nats/lib/nats-base-client/types';

export class StreamApiBlank implements StreamAPI {
  info(stream: string, opts?: Partial<StreamInfoRequestOptions>): Promise<StreamInfo> {
    return Promise.resolve({} as any);
  }
  add(cfg: Partial<StreamConfig>): Promise<StreamInfo> {
    return {} as any;
  }
  update(name: string, cfg: Partial<StreamUpdateConfig>): Promise<StreamInfo> {
    return {} as any;
  }
  purge(stream: string, opts?: PurgeOpts): Promise<PurgeResponse> {
    throw new Error('Method purge not implemented.');
  }
  delete(stream: string): Promise<boolean> {
    throw new Error('Method delete not implemented.');
  }
  list(): Lister<StreamInfo> {
    throw new Error('Method list not implemented.');
  }
  deleteMessage(stream: string, seq: number, erase?: boolean): Promise<boolean> {
    throw new Error('Method deleteMessage not implemented.');
  }
  getMessage(stream: string, query: MsgRequest): Promise<StoredMsg> {
    throw new Error('Method getMessage not implemented.');
  }
  find(subject: string): Promise<string> {
    throw new Error('Method find not implemented.');
  }
}
