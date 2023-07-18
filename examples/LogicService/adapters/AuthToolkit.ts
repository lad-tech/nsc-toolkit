import { AuthToolkitPort } from '../domain/ports';
import { randomUUID, randomBytes, pbkdf2 } from 'crypto';
import { promisify } from 'util';

export class AuthToolkit implements AuthToolkitPort {
  public getId() {
    return randomUUID();
  }

  public async getHash(password: string) {
    const salt = randomBytes(10).toString('hex');
    const hash = await promisify(pbkdf2)(password, salt, 1000, 256, 'sha256');
    return hash.toString('hex');
  }
}
