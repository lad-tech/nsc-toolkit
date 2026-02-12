/**
 * Кейс: сервис с KV (запись/чтение внутри метода) и обращение к клиенту сервиса для извлечения результата.
 *
 * 1. Запускается KvService — внутри метод GetSet использует @kv('cache') для get/put.
 * 2. Через клиент KvService вызываем getset({ key, value }) — запись в KV.
 * 3. Через того же клиента вызываем getset({ key }) — чтение из KV, получаем результат.
 */

import { connect } from 'nats';
import { service } from './service';
import KvServiceClient from './index';

async function main() {
  const broker = await connect({ servers: ['localhost:4222'] });

  // Поднимаем сервис (внутри создаётся KV-бакет "cache", метод GetSet работает с ним через @kv('cache'))
  const serviceInstance = await service(broker);

  // Клиент сервиса — обращаемся к методу GetSet, который внутри использует KV
  const client = serviceInstance.buildService(KvServiceClient);

  const key = 'example-key';

  // Запись в KV через вызов метода сервиса
  const putResult = await client.getset({ key, value: 'Hello from client' });
  console.log('Put result:', putResult);

  // Извлечение результата из KV через тот же клиент
  const getResult = await client.getset({ key });
  console.log('Get result:', getResult);

  await serviceInstance.stop();
  await broker.close();
}

main().catch(console.error);
