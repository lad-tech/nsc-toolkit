import { Service } from '../../src/Service';
import { EmitterMath } from './interfaces';
import { name, events } from './service.json';
import { connect } from 'nats';

import { Sum } from './methods/Sum';
import { SumStream } from './methods/SumStream';
import { Fibonacci } from './methods/Fibonacci';

(async () => {
  const brokerConnection = await connect({ servers: ['localhost:4222'] });
  new Service<EmitterMath>({
    name,
    brokerConnection,
    methods: [Sum, SumStream, Fibonacci],
    events
  }).start();
})();
