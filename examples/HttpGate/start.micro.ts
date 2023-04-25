import { service } from '.';
import { connect } from 'nats';

(async () => {
  const brokerConnection = await connect({ servers: ['localhost:4222'] });
  service(brokerConnection);
})();
