# Контекст обработчика метода

Фреймворк передаёт каждому `handler` второй аргумент — объект системных утилит
`MethodContext`. Обработчики с одним аргументом продолжают работать.

```typescript
import { BaseMethod, type MethodContext } from '@lad-tech/nsc-toolkit';

export class Load extends BaseMethod {
  static settings = { action: 'load' };

  public async handler(request: { url: string }, { signal }: MethodContext) {
    signal.throwIfAborted();
    const response = await fetch(request.url, { signal });
    return response.json();
  }
}
```

## `signal: AbortSignal`

- Создаётся отдельно для каждого вызова, как через NATS, так и через HTTP.
- Отменяется при достижении `baggage.expired` — абсолютного Unix timestamp в
  миллисекундах (HTTP-заголовок `nsc-expired`). Оставшееся время вычисляется от
  этой метки, а не от момента запуска обработчика.
- Если deadline уже истёк, обработчик получает сразу отменённый сигнал.
- Причина отмены — `DOMException` с именем `TimeoutError`.
- Если `expired` не задан, сигнал остаётся активным, таймер не создаётся.
- Таймер освобождается после завершения или ошибки обработчика. Для потокового
  ответа с `useStream.response` он действует до завершения, ошибки или закрытия
  возвращённого `Readable`.

Отмена кооперативная: передавайте `signal` в `fetch`, `pipeline`, таймеры и другие
API с поддержкой отмены либо проверяйте `signal.throwIfAborted()`. Сам по себе
сигнал не прерывает произвольный код и не заменяет результат обработчика ошибкой.
Для уже истёкшего deadline вызывайте `throwIfAborted()` перед началом работы.
Синхронная работа, блокирующая event loop, также задерживает срабатывание таймера.

Объект предназначен для дальнейшего расширения системными утилитами; контроллер
отмены остаётся внутри фреймворка.
