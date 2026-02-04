# KvService — пример сервиса с JetStream KV

Сервис объявляет KV-бакет в схеме (`kvBuckets.cache`) и метод GetSet, который через декоратор `@kv('cache')` пишет и читает из бакета. Бакет **cache** можно использовать в одном сервисе или пошарить со вторым (KvReaderService, см. `examples/KvReaderService` и `examples/KvShared`).

## Версионирование (revision)

- **История версий** задаётся в схеме: `kvBuckets.cache.history` — сколько последних версий ключа хранить (в примере `3`). При превышении старые версии удаляются.
- **Запись**: `put(key, value)` возвращает номер ревизии (`revision`). Его можно сохранять и передавать клиенту.
- **Чтение**: по умолчанию `get(key)` возвращает последнюю версию. Чтобы прочитать конкретную версию — передайте в запросе `revision`:
  - `getset({ key })` — последнее значение;
  - `getset({ key, revision: 2 })` — значение на момент ревизии 2.

Итого: версионирование управляется параметром **history** в схеме бакета и опциональным **revision** в запросе при чтении.

## TTL кеша

- **TTL задаётся на уровне бакета** в схеме: `kvBuckets.cache.ttl` (в секундах). В примере `3600` (1 час) — записи в бакете истекают через час после последнего обновления ключа.
- **Per-key (per-entry) TTL** в текущей реализации NATS JetStream KV (nats 2.x) **не поддерживается**: один TTL применяется ко всему бакету. Если нужны разные сроки жизни для разных ключей — используйте отдельные бакеты с разным `ttl`.

Итого: управление TTL — только через параметр **ttl** в `kvBuckets.<bucketName>` в `service.schema.json`.

## Кейс 1: один сервис — запись/чтение через клиент

1. **Внутри сервиса**: метод GetSet использует инжектированный бакет `cache` (get/put).
2. **Снаружи**: любой код создаёт клиент KvService и вызывает `getset({ key, value })` для записи и `getset({ key })` или `getset({ key, revision })` для чтения.

Запуск (нужен NATS на localhost:4222):

```bash
cd examples/KvService
npm run example
```

## Кейс 2: два сервиса — общий бакет (share bucket)

- **KvService** и **KvReaderService** оба объявляют в схеме один и тот же бакет `cache`.
- KvService пишет в бакет (метод GetSet), KvReaderService только читает (метод Get). Обращение к результату — через клиент нужного сервиса.

Запуск сценария (поднимаются оба сервиса, запись через KvService, чтение через KvReaderService):

```bash
cd examples/KvService
npm run example:shared
```

Подробнее и альтернативный запуск из `examples/KvShared` — см. [KvShared/README.md](../KvShared/README.md).

## Структура

- `service.schema.json` — секция `kvBuckets.cache` (history, ttl), метод GetSet
- `methods/GetSet.ts` — `@kv('cache')`, handler с get/put и опциональным чтением по revision
- `index.ts` — клиент с методом `getset()`
- `example-usage.ts` — сценарий «один сервис»: старт → put/get через клиент
- `run-shared.js` — сценарий «два сервиса»: старт KvService + KvReaderService → put через KvService, get через KvReaderService
