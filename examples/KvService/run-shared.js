/**
 * Кейс: один бакет cache пошарили между двумя сервисами.
 * Запускать из каталога KvService: node run-shared.js
 *
 * — KvService пишет в бакет через GetSet.
 * — KvReaderService читает из того же бакета через Get.
 */
const { connect } = require('nats');
const path = require('path');

async function main() {
  const broker = await connect({ servers: ['localhost:4222'] });

  const kvServiceModule = require(path.join(__dirname, 'dist/service.js'));
  const KvServiceClient = require(path.join(__dirname, 'dist/index.js')).default;
  const kvReaderServiceModule = require(path.join(__dirname, '../KvReaderService/dist/service.js'));
  const KvReaderServiceClient = require(path.join(__dirname, '../KvReaderService/dist/index.js')).default;

  const kvService = await kvServiceModule.service(broker);
  const kvReaderService = await kvReaderServiceModule.service(broker);

  const kvClient = kvService.buildService(KvServiceClient);
  const readerClient = kvReaderService.buildService(KvReaderServiceClient);

  const key = 'shared-key';

  const putResult = await kvClient.getset({ key, value: 'written by Kv, read by KvReader' });
  console.log('Kv (service 1) put:', putResult);

  const getResult = await readerClient.get({ key });
  console.log('KvReader (service 2) get:', getResult);

  await kvService.stop();
  await kvReaderService.stop();
  await broker.close();
}

main().catch(console.error);
