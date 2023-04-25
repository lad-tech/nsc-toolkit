import { service } from '.';

// services
import { service as logicService } from '../LogicService/service';
import { service as mathService } from '../MathService/service';

(async () => {
  const main = await service();

  await Promise.all([logicService(main.broker), mathService(main.broker)]);

  console.log('Union successfully started');
})();
