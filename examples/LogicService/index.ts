import { Client } from '../../src/Client';
import { NatsConnection } from 'nats';
import {
  WeirdSumRequest,
  WeirdSumResponse,
  GetUserRequest,
  GetUserResponse,
  GetUserRequestV2,
  GetUserResponseV2,
} from './interfaces';
import { Baggage, CacheSettings } from '../../src/interfaces';
import { name, methods } from './service.schema.json';
export * from './interfaces';

export default class ServiceMathClient extends Client {
  constructor(broker: NatsConnection, baggage?: Baggage, cache?: CacheSettings) {
    super({ broker, serviceName: name, baggage });
  }

  public async weirdSum(payload: WeirdSumRequest) {
    return this.request<WeirdSumResponse>(`${name}.${methods.WeirdSum.action}`, payload, methods.WeirdSum);
  }

  public async getUser(payload: GetUserRequest) {
    return this.request<GetUserResponse>(`${name}.${methods.GetUser.action}`, payload, methods.GetUser);
  }

  public async getUserV2(payload: GetUserRequestV2) {
    return this.request<GetUserResponseV2>(`${name}.${methods.GetUserV2.action}`, payload, methods.GetUserV2);
  }
}
