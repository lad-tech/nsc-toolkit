import { container, DependencyType, Service } from '..';
import { Configurator, Repository } from '../../examples/LogicService/adapters';
import { ConfiguratorPort, MathPort, RepositoryPort, StoragePort } from '../../examples/LogicService/domain/ports';
import Logic from '../../examples/LogicService/index';
import { TYPES } from '../../examples/LogicService/inversion.types';
import { service as logicService } from '../../examples/LogicService/service';
import Math from '../../examples/MathService/index';
import { InitializableService } from './fixtures/InitializableService';

describe('Successful injection of multi-level dependencies of different types', () => {
  const storage = { test: true };

  container.bind<RepositoryPort>(TYPES.Repository, DependencyType.ADAPTER, Repository);
  container.bind<ConfiguratorPort>(TYPES.Configurator, DependencyType.ADAPTER, Configurator);
  container.bind<StoragePort>(TYPES.Storage, DependencyType.CONSTANT, storage);

  process.env.DEFAULT_REPONSE_TIMEOUT = '50000';

  const service = new Service({
    name: 'ServiceForTest',
    methods: [],
  });

  logicService(service.broker);

  test('Required dependencies successfully injected into method property', async () => {
    const logicClient = service.buildService(Logic);
    const result = await logicClient.getUser({ userId: 'test' });

    expect(result).toEqual({ firstName: 'Jon', lastName: 'Dow' });
  });

  test('Required dependencies successfully injected into method constructor parameter', async () => {
    const logicClient = service.buildService(Logic);
    const result = await logicClient.getUserV2({ userId: 'test' });

    expect(result).toEqual({ firstName: 'Jon', lastName: 'Dow' });
  });

  test('Adapter with sync and async methods successfully injected', async () => {
    const logicClient = service.buildService(Logic);
    const result = await logicClient.registerNewUser({ username: 'JonDow', password: 'qwerty' });

    expect(result.id).not.toBeUndefined();
    expect(result.hash).not.toBeUndefined();
  });

  describe('Getting an instance of a dependency', () => {
    test('Can get an instance of a dependency from a container', async () => {
      const repository = container.getInstance<RepositoryPort>(TYPES.Repository);

      const result = await repository?.getUserById('test');

      expect(result).toEqual({ firstName: 'Jon', lastName: 'Dow' });
    });

    test('If the dependency is not bound to a container, an error is returned', async () => {
      await container.unbind(TYPES.Repository);
      expect(() => container.getInstance<RepositoryPort>(TYPES.Repository)).toThrow();
    });

    test('Can`t get service instance', async () => {
      container.bind<MathPort>(TYPES.Math, DependencyType.SERVICE, Math);
      expect(() => container.getInstance<RepositoryPort>(TYPES.Math)).toThrow();
    });

    test('If an instance of a constant is requested, a constant is returned', async () => {
      expect(container.getInstance(TYPES.Storage)).toEqual(storage);
    });
  });

  describe('Adapter options', () => {
    const key = Symbol.for('InitializableServiceBindUnbind');

    test('By default, a new adapter instance is returned each time', async () => {
      container.bind<RepositoryPort>(TYPES.Repository, DependencyType.ADAPTER, Repository);

      const repository_one = container.getInstance<RepositoryPort>(TYPES.Repository);
      const repository_two = container.getInstance<RepositoryPort>(TYPES.Repository);

      expect(repository_one !== repository_two).toBeTruthy();
    });
    test('Can make a singleton from an adapter using options', async () => {
      const key = Symbol.for('SingltonRepository');
      container.bind<RepositoryPort>(key, DependencyType.ADAPTER, Repository, { singlton: true });

      const repository_one = container.getInstance<RepositoryPort>(key);
      const repository_two = container.getInstance<RepositoryPort>(key);

      expect(repository_one === repository_two).toBeTruthy();
    });
    test('Initializable service is singlton', async () => {
      const key = Symbol.for('InitializableService');
      container.bind<InitializableService>(key, DependencyType.ADAPTER, InitializableService, { init: true });

      const initializableService_one = container.getInstance<InitializableService>(key);
      const initializableService_two = container.getInstance<InitializableService>(key);

      expect(initializableService_one === initializableService_two).toBeTruthy();
    });
    test('initializable services can be init', async () => {
      container.bind<InitializableService>(key, DependencyType.ADAPTER, InitializableService, { init: true });

      const [instance] = await container.initDependencies();
      const init = instance.init as jest.Mock;

      expect(init).toBeCalledTimes(1);
    });
    test('initializable services can be unbind', async () => {
      const instanceOne = container.getInstance(key);
      await container.unbind(key);
      container.bind<InitializableService>(key, DependencyType.ADAPTER, InitializableService, { init: true });
      const [instanceTwo] = await container.initDependencies();

      expect(instanceOne !== instanceTwo).toBeTruthy();
    });
    test('with symbol().to syntax', async () => {
      const key = Symbol.for('MyAdapter');
      const key2 = Symbol.for('MyConstant');
      container.symbol(key).to.Adapter(InitializableService);
      container.symbol(key2).to.Constant({ obj: 'value' });
      const instance = container.getInstance<InitializableService>(key);
      const instance2 = container.getInstance<object>(key2);

      expect(instance instanceof InitializableService).toEqual(true);
      expect(instance2).toEqual({ obj: 'value' });
    });
  });
});
