import { Logs } from '@lad-tech/toolbelt';
import Fastify from 'fastify';
import { NatsConnection } from 'nats';
import { Baggage, ExternalBaggage } from '../../src/interfaces';
import { Service } from '../../src/Service';
import LogicService, { GetUserRequest, WeirdSumRequest } from '../LogicService';
import MathService from '../MathService';
import { methods, Ref } from '../MathService/service.schema.json';
import { SimpleCache } from '../SimpleCache';

declare module 'fastify' {
  interface FastifyRequest {
    baggage: Baggage;
  }
}

const SERVICE_NAME = 'HttpGate';
const HTTP_SERVICE_PORT = 8000;
const logger = new Logs.Logger({ location: 'HttpGate' });

const upHttpGate = async (service: Service) => {
  const mathService = service.buildService(MathService);

  const mathEmmiter = mathService.getListener(SERVICE_NAME, { deliver: 'all' });

  mathEmmiter.on('Elapsed', message => {
    logger.info('Get new event "Elapsed": ', message.data);
    message.ack();
  });

  mathEmmiter.on('Notify', message => {
    logger.info('Get new event "Notify": ', message.data);
  });

  const fastify = Fastify();
  /**
   * FYI для использования схемы из сервиса в качестве схемы валидации,
   * требуется передать все доп схемы в валидатор.
   **/
  fastify.addSchema(Ref);

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
  fastify.post<{ Body: WeirdSumRequest }>(
    '/math/simpleSum',
    {
      schema: {
        body: methods.Sum.request,
        response: { 200: methods.Sum.response },
      },
    },
    async request => {
      return await service.buildService(MathService, request.baggage).sum(request.body);
    },
  );

  fastify.get<{ Params: GetUserRequest }>('/logic/user/:userId', async request => {
    return await service.buildService(LogicService, request.baggage).getUser(request.params);
  });

  await fastify.listen({ port: HTTP_SERVICE_PORT });
  logger.info(`listen on ${HTTP_SERVICE_PORT}`);
};

export const service = async (brokerConnection?: NatsConnection) => {
  try {
    const service = new Service({
      brokerConnection,
      name: SERVICE_NAME,
      methods: [],
      cache: { service: new SimpleCache(), timeout: 0 },
    });

    await service.start();
    await upHttpGate(service);
    logger.info('Http server start on port:', HTTP_SERVICE_PORT);
    return service;
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
};
