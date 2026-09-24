# Middleware

Middleware позволяют выполнить дополнительную логику вокруг вызовов методов других сервисов. Они подключаются при создании `Service` и автоматически применяются ко всем клиентам, созданным через `service.buildService(...)`.

Основные сценарии:

- проверить права пользователя перед вызовом другого сервиса;
- добавить служебные параметры в запрос;
- нормализовать ответ внешнего сервиса;
- выполнить действие после успешного вызова метода сервиса;
- обработать ошибку вызова и привести ее к нужному формату.

## Подключение

Middleware регистрируются через DI-контейнер. Это значит, что внутри middleware можно использовать стандартный `@inject`.

```ts
import { DependencyType, Service, container } from '@lad-tech/nsc-toolkit';

const TYPES = {
  AuthMiddleware: Symbol('AuthMiddleware'),
  AuditMiddleware: Symbol('AuditMiddleware'),
};

container.bind(TYPES.AuthMiddleware, DependencyType.ADAPTER, AuthMiddleware);
container.bind(TYPES.AuditMiddleware, DependencyType.ADAPTER, AuditMiddleware);

const service = new Service({
  name: 'Logic',
  brokerConnection,
  methods,
  middleware: {
    service: {
      before: [TYPES.AuthMiddleware],
      after: [TYPES.AuditMiddleware],
    },
  },
});
```

Ключ `service` означает, что middleware применяются к зависимостям типа `DependencyType.SERVICE`, то есть к вызовам других сервисов через клиент.

## Точки Выполнения

Для `service` доступны две точки:

- `before` 一 выполняется перед вызовом метода другого сервиса;
- `after` 一 выполняется после вызова метода другого сервиса.

В каждой точке можно зарегистрировать несколько middleware. Они выполняются последовательно в порядке объявления.

```ts
middleware: {
  service: {
    before: [TYPES.FirstMiddleware, TYPES.SecondMiddleware],
    after: [TYPES.ThirdMiddleware],
  },
}
```

## Контекст

В метод `run` передается объект контекста.

```ts
import { ServiceMiddlewareContext } from '@lad-tech/nsc-toolkit';

class SomeMiddleware {
  async run(context: ServiceMiddlewareContext) {
    // middleware logic
  }
}
```

Контекст содержит:

```ts
interface ServiceMiddlewareContext<C = Client, S = Service> {
  client: C;
  service: S;
  method: string;
  params: unknown;
  result?: unknown;
  error?: unknown;
  baggage?: Baggage;
}
```

Поля:

- `client` 一 инстанс клиента сервиса, метод которого вызывается;
- `service` 一 текущий инстанс `Service`;
- `method` 一 имя вызываемого метода клиента;
- `params` 一 параметры вызова метода клиента;
- `result` 一 результат вызова, доступен в `after`;
- `error` 一 оригинальная ошибка, если вызов завершился ошибкой;
- `baggage` 一 текущий baggage запроса.

Если при создании `Service` был передан кеш, его можно получить через объект сервиса:

```ts
const cache = context.service.getCache();
```

`getCache()` возвращает инстанс кеширующего сервиса или `undefined`.

## Изменение Параметров

Middleware может мутировать `context.params` напрямую.

```ts
class AddTenantMiddleware {
  async run(context: ServiceMiddlewareContext) {
    context.params = {
      ...(context.params as Record<string, unknown>),
      tenantId: 'tenant-1',
    };
  }
}
```

После этого метод клиента будет вызван уже с измененными параметрами.

## Изменение Результата

Middleware в точке `after` может мутировать `context.result`.

```ts
class NormalizeResponseMiddleware {
  async run(context: ServiceMiddlewareContext) {
    context.result = {
      data: context.result,
    };
  }
}
```

Именно измененное значение будет возвращено из метода клиента.

## Пример: Проверка Прав Перед Вызовом Метода

В примере `Logic` сервис вызывает `User` сервис. Перед вызовом нужно проверить, что текущий пользователь имеет право вызвать метод `getUser`.

```ts
import { DependencyType, Service, ServiceMiddlewareContext, container, inject } from '@lad-tech/nsc-toolkit';

const TYPES = {
  AuthMiddleware: Symbol('AuthMiddleware'),
  PermissionService: Symbol('PermissionService'),
};

interface PermissionService {
  canReadUser(userId: string, targetUserId: string): Promise<boolean>;
}

class AuthMiddleware {
  constructor(@inject(TYPES.PermissionService) private permissions: PermissionService) {}

  async run(context: ServiceMiddlewareContext) {
    if (context.method !== 'getUser') {
      return;
    }

    const params = context.params as { userId: string; targetUserId: string };
    const allowed = await this.permissions.canReadUser(params.userId, params.targetUserId);

    if (!allowed) {
      throw new Error('User has no access to requested user');
    }
  }
}

container.bind(TYPES.PermissionService, DependencyType.ADAPTER, PermissionServiceAdapter);
container.bind(TYPES.AuthMiddleware, DependencyType.ADAPTER, AuthMiddleware);

const service = new Service({
  name: 'Logic',
  brokerConnection,
  methods,
  middleware: {
    service: {
      before: [TYPES.AuthMiddleware],
    },
  },
});
```

Теперь любой клиент, созданный через `service.buildService(...)`, будет проходить через `AuthMiddleware` перед вызовом метода.

```ts
const userService = service.buildService(UserServiceClient, baggage);

await userService.getUser({
  userId: 'admin-1',
  targetUserId: 'user-1',
});
```

Если проверка прав не пройдет, вызов метода другого сервиса не будет выполнен.

## Пример: Действие После Успешного Вызова

В примере после успешного вызова метода `createPayment` нужно записать событие в аудит.

```ts
import { DependencyType, Service, ServiceMiddlewareContext, container, inject } from '@lad-tech/nsc-toolkit';

const TYPES = {
  AuditMiddleware: Symbol('AuditMiddleware'),
  AuditRepository: Symbol('AuditRepository'),
};

interface AuditRepository {
  save(event: Record<string, unknown>): Promise<void>;
}

class AuditMiddleware {
  constructor(@inject(TYPES.AuditRepository) private auditRepository: AuditRepository) {}

  async run(context: ServiceMiddlewareContext) {
    if (context.error || context.method !== 'createPayment') {
      return;
    }

    await this.auditRepository.save({
      method: context.method,
      params: context.params,
      result: context.result,
      requestId: context.baggage?.requestId,
      createdAt: new Date().toISOString(),
    });
  }
}

container.bind(TYPES.AuditRepository, DependencyType.ADAPTER, AuditRepositoryAdapter);
container.bind(TYPES.AuditMiddleware, DependencyType.ADAPTER, AuditMiddleware);

const service = new Service({
  name: 'Order',
  brokerConnection,
  methods,
  middleware: {
    service: {
      after: [TYPES.AuditMiddleware],
    },
  },
});
```

`AuditMiddleware` выполнится после вызова метода сервиса. Если вызов завершился ошибкой, `context.error` будет заполнен, и middleware в примере ничего не сделает.

## Обработка Ошибок

Если вызов метода клиента завершился ошибкой, middleware из `after` все равно будут выполнены.

В этом случае:

- `context.error` содержит оригинальную ошибку;
- `context.result` содержит объект ошибки.

Формат `context.result`:

```ts
{
  error: {
    message: string;
  }
}
```

Это позволяет привести ошибку к нужному формату.

```ts
class ErrorNormalizeMiddleware {
  async run(context: ServiceMiddlewareContext) {
    if (!context.error) {
      return;
    }

    context.result = {
      success: false,
      message: (context.result as { error: { message: string } }).error.message,
    };
  }
}
```

Если в middleware нужно сохранить fail-fast поведение, можно повторно бросить ошибку.

```ts
class RethrowMiddleware {
  async run(context: ServiceMiddlewareContext) {
    if (context.error) {
      throw context.error;
    }
  }
}
```

## Что Важно Учитывать

- Middleware применяются ко всем клиентам, созданным через `service.buildService(...)`.
- Middleware не применяются к методам адаптеров, инжектируемых через `@inject`.
- Middleware регистрируются через символы контейнера, а не через готовые инстансы.
- Метод клиента принимает один параметр. Если нужно передать массив, массив должен быть самим значением `context.params`.
- Базовые методы клиента, например `getListener`, не оборачиваются middleware.
