import { Service } from '../../src/Service';
import { connect, NatsConnection } from 'nats';
import { name } from './service.schema.json';

import { WeirdSum } from './methods/WeirdSum';

export const service = async (broker?: NatsConnection) => {
  const brokerConnection = broker || (await connect({ servers: ['localhost:4222'] }));
  const service = new Service({
    name,
    brokerConnection,
    methods: [WeirdSum],
  });
  await service.start();
  return service;
};
