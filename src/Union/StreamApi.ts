import {
  StreamAPI,
  StreamInfoRequestOptions,
  StreamInfo,
  StreamConfig,
  StreamUpdateConfig,
  PurgeOpts,
  PurgeResponse,
  Lister,
  MsgRequest,
  StoredMsg,
  KvStatus,
  ObjectStoreStatus,
  Stream,
} from 'nats';

export class StreamApiBlank implements StreamAPI {
  listKvs(): Lister<KvStatus> {
    throw new Error('Method not implemented.');
  }
  listObjectStores(): Lister<ObjectStoreStatus> {
    throw new Error('Method not implemented.');
  }
  names(subject?: string | undefined): Lister<string> {
    throw new Error('Method not implemented.');
  }
  get(name: string): Promise<Stream> {
    throw new Error('Method not implemented.');
  }
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
    return Promise.resolve('Ok');
  }
}
