import { Root } from '../Root';
import { Baggage } from '../interfaces';
import * as opentelemetry from '@opentelemetry/api';

describe('Testing Root class methods', () => {
  class ProxyRootMethodClass extends Root {
    constructor() {
      super({} as any);
    }

    public castToNumberProxy(value?: string) {
      return this.castToNumber(value);
    }

    public getSettingFromEnvProxy(name: string, required = true) {
      return this.getSettingFromEnv(name, required);
    }

    public getContextProxy(baggage?: Baggage) {
      return this.getContext(baggage);
    }

    public getExpiredProxy(expired?: number, ownTimeout?: number) {
      return this.getExpired(expired, ownTimeout);
    }

    public buildErrorMessageProxy(error: string | Error, code?: number) {
      return this.buildErrorMessage(error, code);
    }
  }

  const root = new ProxyRootMethodClass();

  describe('Testing the "castToNumber" method', () => {
    test('The method correctly converts the string to a number', () => {
      const param = '100';
      const result = root.castToNumberProxy(param);

      expect(result).toBe(100);
    });

    test('If the string cannot be converted to a number, then an error is generated.', () => {
      const param = '3e';
      expect(() => root.castToNumberProxy(param)).toThrow();
    });
  });

  describe('Testing the "getSettingFromEnv" method', () => {
    const undefinedVariableName = 'UNDEFINED_VARIABLE';

    const testVariableName = 'TEST_ENV_VARIABLE';
    const testVariableValue = 'test';

    process.env[testVariableName] = testVariableValue;

    test('The method correctly returns the value of the environment variable', () => {
      const result = root.getSettingFromEnvProxy(testVariableName);

      expect(result).toBe(testVariableValue);
    });

    test('If there is no variable passed but it is not required, undefined is returned', () => {
      const result = root.getSettingFromEnvProxy(undefinedVariableName, false);

      expect(result).toBeUndefined();
    });

    test('If there is no passed variable and it is required, then an error is generated.', () => {
      expect(() => root.getSettingFromEnvProxy(undefinedVariableName)).toThrow();
    });
  });

  describe('Testing the "getContext" method', () => {
    const setSpanContext = jest.spyOn(opentelemetry.trace, 'setSpanContext');
    jest.spyOn(opentelemetry.context, 'active');

    test('Correctly creates a new context from the baggage object if it is passed', () => {
      const context = 'context';
      setSpanContext.mockReturnValue(context as any);

      const result = root.getContextProxy({ spanId: '1', traceId: '1', traceFlags: 1 });

      expect(result).toBe(context);
    });
  });

  describe('Testing the "getExpired" method', () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const ENV = process.env;
    const DEFAULT_REPONSE_TIMEOUT = 20;

    beforeAll(() => {
      jest.resetModules();
      process.env = { ...ENV, DEFAULT_REPONSE_TIMEOUT: DEFAULT_REPONSE_TIMEOUT.toString() };
    });

    afterAll(() => {
      process.env = ENV;
    });

    test('Timeout timestamp is correctly generated. The timeout in seconds is taken from the environment variable', () => {
      const result = root.getExpiredProxy();

      expect(result).toBe(DEFAULT_REPONSE_TIMEOUT * 1000);
    });

    test('Timeout timestamp is correctly generated. The timeout in seconds is taken from the passed value', () => {
      const customTimeout = 30;
      const result = root.getExpiredProxy(undefined, customTimeout);

      expect(result).toBe(customTimeout * 1000);
    });

    test('Timeout timestamp is correctly generated. If the timeout is already set, it remains unchanged', () => {
      const timeout = 40000;
      const result = root.getExpiredProxy(timeout);

      expect(result).toBe(timeout);
    });

    test('If timeout is not passed and timeout is not set in environment variables, the process exits with an error', () => {
      process.env.DEFAULT_REPONSE_TIMEOUT = undefined;
      jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error();
      });
      expect(() => root.getExpiredProxy()).toThrow();
    });
  });

  describe('Testing the "buildErrorMessage" method', () => {
    const message = 'Test error message';

    const getError = (code?: number) => ({
      payload: null,
      error: {
        message,
        code,
      },
    });

    test('Correct generation of an error object from a string', () => {
      const result = root.buildErrorMessageProxy(message);

      expect(result).toMatchObject(getError());
    });

    test('Correct generation of an error object from an error object', () => {
      const result = root.buildErrorMessageProxy(new Error(message));

      expect(result).toMatchObject(getError());
    });

    test('Correct generation of an error object from an error object with an error code', () => {
      const errorCode = 20;
      const result = root.buildErrorMessageProxy(new Error(message), errorCode);

      expect(result).toMatchObject(getError(errorCode));
    });
  });
});
