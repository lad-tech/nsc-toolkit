import { container, Service } from '..';
import Logic from '../../examples/LogicService/index';
import Math from '../../examples/MathService/index';
import { service as logicService } from '../../examples/LogicService/service';
import { DependencyType } from '..';
import { RepositoryPort, ConfiguratorPort, StoragePort, MathPort } from '../../examples/LogicService/domain/ports';
import { TYPES } from '../../examples/LogicService/inversion.types';

import { Configurator, Repository } from '../../examples/LogicService/adapters';

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
    test('Из контейнера можно получить экземпляр зависимости', async () => {
      const repository = container.getInstance<RepositoryPort>(TYPES.Repository);

      const result = await repository?.getUserById('test');

      expect(result).toEqual({ firstName: 'Jon', lastName: 'Dow' });
    });

    test('If the dependency is not bound to a container, an error is returned', async () => {
      container.unbind(TYPES.Repository);
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
});
