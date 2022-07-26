import { connect } from 'nats';
import LogicService, { WeirdSumRequest } from '../LogicService';
import { Service } from '../../src/Service';
import { SimpleCache } from '../SimpleCache';
import { Logs } from '@lad-tech/toolbelt';
import Fastify from 'fastify';
import { Baggage, ExternalBaggage } from '../../src/interfaces';

declare module 'fastify' {
  interface FastifyRequest {
    baggage: Baggage;
  }
}

const HTTP_SERVICE_PORT = 8000;
const logger = new Logs.Logger({ location: 'HttpGate' });

const upHttpGate = async (service: Service) => {
  const fastify = Fastify();

  fastify.decorateRequest('baggage', null);

  fastify.addHook<{ Headers: ExternalBaggage }>('preHandler', (request, reply, done) => {
    request.baggage = service.getRootBaggage(request.routerPath, request.headers);
    reply.header('trace-id', request.baggage.traceId);
    done();
  });

  fastify.addHook<{ Headers: ExternalBaggage }>('onResponse', (request, reply, done) => {
    service.endRootSpan(request.baggage.traceId);
    done();
  });

  fastify.post<{ Body: WeirdSumRequest }>('/math/weird/sum', async request => {
    return await service.buildService(LogicService, request.baggage).weirdSum(request.body);
  });

  await fastify.listen({ port: HTTP_SERVICE_PORT });
};

const start = async () => {
  try {
    const brokerConnection = await connect({ servers: ['localhost:4222'] });
    const service = new Service({
      brokerConnection,
      name: 'HttpGate',
      methods: [],
      events: [],
      cache: { service: new SimpleCache(), timeout: 100 },
    });

    await service.start();
    await upHttpGate(service);
    logger.info('Http server start on port:', HTTP_SERVICE_PORT);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
};

start();
