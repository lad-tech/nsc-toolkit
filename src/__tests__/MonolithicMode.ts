import { Service } from '..';
import LogicService from '../../examples/LogicService/index';
import { service as mathServiceStart } from '../../examples/MathService/service';
import { service as logicServiceStart } from '../../examples/LogicService/service';

describe('Services can run in monolithic mode', () => {
  process.env['DEFAULT_REPONSE_TIMEOUT'] = '10000';
  process.env['ENVIRONMENT'] = 'local';

  test('Successful calculation of a weird sum', async () => {
    const mainService = new Service({
      name: 'Starter',
      methods: [],
    });

    jest.spyOn(process, 'exit').mockImplementation((code?: number) => undefined as never);

    await mainService.start();

    const [logicService, mathService] = await Promise.all([
      logicServiceStart(mainService.broker),
      mathServiceStart(mainService.broker),
    ]);

    const { result } = await mainService.buildService(LogicService).weirdSum({ a: 3, b: 5 });

    await Promise.all([mainService.stop(), logicService.stop(), mathService.stop()]);

    expect(result).toBe(87);
  });
});
