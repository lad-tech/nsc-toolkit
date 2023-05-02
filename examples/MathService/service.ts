import { Service } from '../../src/Service';
import { EmitterMath } from './interfaces';
import { connect, NatsConnection } from 'nats';
import { name, events } from './service.schema.json';

import { Sum } from './methods/Sum';
import { SumStream } from './methods/SumStream';
import { Fibonacci } from './methods/Fibonacci';

export const service = async (broker?: NatsConnection) => {
  const brokerConnection = broker || (await connect({ servers: ['localhost:4222'] }));
  const service = new Service<EmitterMath>({
    name,
    brokerConnection,
    methods: [Sum, SumStream, Fibonacci],
    events,
  });
  await service.start();
  return service;
};
