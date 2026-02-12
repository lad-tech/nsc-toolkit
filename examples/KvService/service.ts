import { connect, NatsConnection } from 'nats';
import { Service } from '../../src/Service';
import { name, methods, kvBuckets } from './service.schema.json';
import { GetSet } from './methods/GetSet';

export const service = async (broker?: NatsConnection) => {
  const brokerConnection = broker || (await connect({ servers: ['localhost:4222'] }));
  const serviceInstance = new Service({
    name,
    brokerConnection,
    methods: [GetSet],
    kvBuckets,
  });
  await serviceInstance.start();
  return serviceInstance;
};
