import { GetUserRequest, GetUserResponse } from '../interfaces';
import { inject } from '../../../src/injector';
import { methods } from '../service.schema.json';
import { TYPES } from '../inversion.types';
import { RepositoryPort } from '../domain/ports';

import { BaseMethod } from '../../../src/Method';

export class GetUserV2 extends BaseMethod {
  static settings = methods.GetUserV2;

  constructor(@inject(TYPES.Repository) private repository: RepositoryPort) {
    super();
  }

  public async handler({ userId }: GetUserRequest): Promise<GetUserResponse> {
    const result = await this.repository.getUserById(userId);

    if (!result) {
      throw new Error(`User ${userId} not found!`);
    }

    return result;
  }
}
