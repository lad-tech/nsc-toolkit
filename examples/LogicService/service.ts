import { Service, DependencyType, container } from '../../src';
import { connect, NatsConnection } from 'nats';
import { name } from './service.schema.json';
import { TYPES } from './inversion.types';

// Ports
import { MathPort, RepositoryPort, ConfiguratorPort, StoragePort } from './domain/ports';

// Adapters
import { Configurator, Repository } from './adapters';

// Services
import Math from '../MathService/index';

// Methods
import { WeirdSum } from './methods/WeirdSum';
import { GetUser } from './methods/GetUser';
import { GetUserV2 } from './methods/GetUserV2';

export const service = async (broker?: NatsConnection) => {
  const brokerConnection = broker || (await connect({ servers: ['localhost:4222'] }));

  const storage = { test: true };

  container.bind<MathPort>(TYPES.Math, DependencyType.SERVICE, Math);
  container.bind<RepositoryPort>(TYPES.Repository, DependencyType.ADAPTER, Repository);
  container.bind<ConfiguratorPort>(TYPES.Configurator, DependencyType.ADAPTER, Configurator);
  container.bind<StoragePort>(TYPES.Storage, DependencyType.CONSTANT, storage);

  const service = new Service({
    name,
    brokerConnection,
    methods: [WeirdSum, GetUser, GetUserV2],
  });
  await service.start();
  return service;
};
