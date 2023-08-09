export class InitializableService {
  public init = jest.fn().mockResolvedValue('Ok');
  public close = jest.fn().mockResolvedValue('Ok');
}
