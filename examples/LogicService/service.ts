import { Service } from '../../src/Service';
import { name } from './service.json';
import { connect, NatsConnection } from 'nats';

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
