import { Service } from '../../src/Service';
import { name } from './service.json';
import { connect } from 'nats';

import { WeirdSum } from './methods/WeirdSum';

(async () => {
  const brokerConnection = await connect({ servers: ['localhost:4222'] });
  new Service({
    name,
    brokerConnection,
    methods: [WeirdSum],
    events: [],
  }).start();
})();
