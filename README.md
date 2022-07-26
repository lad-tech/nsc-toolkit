nsc-toolkit (NATS service creator toolkit) - это набор инструментов для создания сервис-ориентированная архитектуры вокруг брокера сообщений [NATS](https://nats.io/). Основная идеология тулкита - это простой инструмент с минимальным количеством зависимостей позволяющий создавать сервисы с помощью интсрументов кодогенерации на основе простого описания в JSON. 

## Возможности

* Простота и минимальное количество зависимостей за счет снижения уровня вариативности.
* Схема взаимодействия request/reply.
* Схема взаимодействия pub/sub.
* Сквозной таймаут для запросов.
* Трассировки. 
* Использование Web-стримов.
* Межсервисное кеширование.
* Валидация входных и выходных параметров методов сервиса в рантайме на основе [JSON Schema](https://json-schema.org/).
* Логирование с учетом контекста.

## Схема описания сервиса

Сервисы описываются в JSON файле. Схема:

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "methods": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "action": { "type": "string" },
          "description": { "type": "string" },
          "options": { "$ref": "#/$defs/options" },
          "request": { "type": "object" },
          "response": { "type": "object" }
        },
        "required": [ "action", "description", "options" ]
      }
    },
    "events": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" },
          "message": { "type": "object" }
        },
        "required": [ "action", "description", "options", "message" ]
      }
    }
  },
  "required": [ "name", "description", "methods" ],

  "$defs": {
    "options": {
      "type": "object",
      "properties": {
        "useStream": {
          "type": "object",
          "properties": {
            "request": { "type": "boolean" },
            "response": { "type": "boolean" }
          }
        },
        "cache": { "type": "number" },
        "runTimeValidation": {
          "type": "object",
          "properties": {
            "request": { "type": "boolean" },
            "response": { "type": "boolean" }
          }
        }
      }
    }
  }
}
```

- **name** - Название сервиса.
- **description** - Описание сервиса.
- **methods** - Набор методов для реализации схемы request/reply
  - **action** - Идентификатор запроса.
  - **description** - Описание метода.
  - **request** - JSON Schema входных данных.
  - **response** - JSON Schema выходных данных.
  - **options** - Настройки метода.
    - **useStream** - Использование Web-стримов для входных и выходных данных.
      - **request** - Web-стрим на входе.
      - **response** - Web-стрим на выходе.
    - **cache** - Кешировать запрос. Задается в минутах.
    - **runTimeValidation** - Использовать run time валидацию параметров
      - **request** - Для входных данных.
      - **response** - Для выходных данных.
- **events** - Набор событий генерируемый сервисом для реализации схемы pub/sub
  - **name** - Идентификатор события.
  - **description** - Описание события.
  - **event** - JSON Schema события.

## Пример использования

Пример использования инструментов тулкита находится в папке **exaples**

В результате запросов к тестовым сервисам генерируются трассировки следующего вида

![Таймлайн](./examples/misc/trace_1.png)

![Таймлайн](./examples/misc/trace_1.png)

## Описание переменных окружения

 - **DEFAUL_RESPONSE_TIMEOUT** - Внешнее ограничение таймаута при запросе в секундах. Используется при первоначальном формировании времени таймаута в багаже по формуле *Date.now() + DEFAULT_RESPONSE_TIMEOUT*

 - **OTEL_AGENT** - Хост агента по сбору распределенных трассировок.