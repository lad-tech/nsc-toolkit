import { RegisterNewUserRequest, RegisterNewUserResponse } from '../interfaces';
import { inject } from '../../../src/injector';
import { methods } from '../service.schema.json';
import { TYPES } from '../inversion.types';
import { AuthToolkitPort } from '../domain/ports';

import { BaseMethod } from '../../../src/Method';

export class RegisterNewUser extends BaseMethod {
  static settings = methods.RegisterNewUser;

  constructor(@inject(TYPES.AuthTookit) private authToolkit: AuthToolkitPort) {
    super();
  }

  public async handler({ password }: RegisterNewUserRequest): Promise<RegisterNewUserResponse> {
    const id = this.authToolkit.getId();
    const hash = await this.authToolkit.getHash(password);
    return { id, hash };
  }
}
