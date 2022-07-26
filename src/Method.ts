import { Logs } from '@lad-tech/toolbelt';
import { Emitter } from './interfaces';

export class BaseMethod<E extends Emitter = Record<string, () => void>> {
  protected logger: Logs.Logger;
  protected emitter: E;
}
