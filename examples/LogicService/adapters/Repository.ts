import { inject } from '../../../src';
import { TYPES } from '../inversion.types';
import { ConfiguratorPort } from '../domain/ports';

export class Repository {
  @inject(TYPES.Configurator) private configurator: ConfiguratorPort;

  public async getUserById(userId: string) {
    const exist = await this.configurator.userIdExist(userId);

    if (exist) {
      return { firstName: 'Jon', lastName: 'Dow' };
    }

    return null;
  }
}
