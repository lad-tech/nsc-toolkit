# HTTP stream deadlines, limits and cancellation

HTTP methods use the existing absolute `baggage.expired` deadline across
address discovery, connection/upload, response headers and the entire response
body. The deadline is not reset after discovery or after a chunk arrives.

Before a response stream is returned, cancellation rejects the client call.
After it is returned, cancellation destroys the stream with an error: callers
must consume it with error handling, for example using `pipeline` or
`for await` inside `try/catch`.

## Per-call cancellation

A client method can accept an optional second argument:

```ts
import { CallOptions, Client } from '@lad-tech/nsc-toolkit';

class FilesClient extends Client {
  public parse(payload: ParseRequest, callOptions?: CallOptions) {
    return this.request<ParseResponse>('Files.parse', payload, methods.Parse, callOptions);
  }
}

const controller = new AbortController();
const result = client.parse(payload, { signal: controller.signal });
controller.abort();
```

The constructor and application-specific types/settings are omitted above.
Existing methods without the new argument continue to work. The separate
`nsc-cli` generator must also support forwarding this argument before
regenerating clients for explicit cancellation.

Service middleware receives the explicit options as `context.callOptions`.
The framework passes those options to the client after `before` middleware.
Existing middleware error/result handling is unchanged.

Address discovery itself uses a bounded broker request. Cancelling the HTTP
call stops waiting immediately; a late discovery result cannot start HTTP,
and a late rejection is still observed.

## Server options

Set options on the receiving method:

```ts
{
  useStream: {
    request: true,
    response: true,
    maxRequestBytes: 10 * 1024 * 1024,
    cancelOnDisconnect: true,
  },
}
```

- `maxRequestBytes` is an optional positive safe integer. It limits streamed
  request bytes, not object count or response size. When omitted, there is
  no toolkit request-size limit.
- The server counts actual bytes without buffering the body, including chunked
  requests without `Content-Length`. Exactly the limit is allowed. An oversized
  `Content-Length` permits rejection before invoking the handler.
- Overflow stops the input and cancels cooperative work. Before response
  headers are sent, the server returns HTTP 413 with the usual JSON error
  envelope and closes the connection without draining an unlimited body.
- If a response has already started, overflow closes it instead: HTTP cannot
  replace headers already sent. To guarantee a 413 response, finish consuming
  the request before producing the response.
- `cancelOnDisconnect` defaults to false. When enabled, premature closure of
  the HTTP response cancels the handler's existing `MethodContext.signal`.
  Normal completion does not cancel it. The deadline remains active regardless
  of this option.

## Cancellation across services

The same handler signal covers the deadline and caller disconnection:

```text
caller cancels
  -> gateway closes its outgoing HTTP request
    -> receiving service cancels MethodContext.signal
      -> its downstream HTTP calls and signal-aware adapters stop
```

Clients injected into a method through `@inject` or `@service`, including
constructor injection, automatically inherit that invocation's signal.
Explicit per-call signals supplement the inherited signal; they cannot
override cancellation of the parent operation.
Enable `cancelOnDisconnect` on every receiving HTTP method in a cancellable
chain; an HTTP method without that opt-in does not cancel on caller disconnect.

For an HTTP gateway outside a toolkit method, bind its incoming request's
cancellation signal when building a client:

```ts
const controller = new AbortController();
response.once('close', () => {
  if (!response.writableFinished) controller.abort();
});

const client = gateway.buildService(FilesClient, baggage, {
  signal: controller.signal,
});
```

Create the client for that invocation, not as a shared singleton. A directly
constructed client can receive `signal` through `ClientParam` or `withSignal`.

Local work and external adapters must cooperate with cancellation:

```ts
public async handler(payload: Request, { signal }: MethodContext) {
  signal.throwIfAborted();
  return storage.read(payload.key, { signal });
}
```

Pass the signal using the external SDK's supported option (for example,
`abortSignal` for AWS SDK commands). Check it between CPU processing steps.
The toolkit cannot forcibly stop arbitrary JavaScript or roll back completed
side effects.

## NATS compatibility

Explicit `{ signal }` on NATS request/reply is rejected as unsupported before
cache lookup or broker transmission. Existing NATS calls remain unchanged;
automatically inherited signals are ignored for that transport.

Consequently, cancellation propagates through HTTP service calls only.
A NATS hop breaks remote cancellation, including in the monolithic broker.
There is no NATS cancellation protocol in this feature.
