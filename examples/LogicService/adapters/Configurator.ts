import { inject } from '../../../src';
import { TYPES } from '../inversion.types';
import { StoragePort } from '../domain/ports';

export class Configurator {
  @inject(TYPES.Storage) private storage: StoragePort;

  public async setUserId(userId: string) {
    this.storage[userId] = true;
  }

  public async userIdExist(userId: string) {
    return !!this.storage[userId];
  }
}
