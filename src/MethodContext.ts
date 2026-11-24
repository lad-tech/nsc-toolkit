import type { MethodContext } from './interfaces';

/** Owns the deadline timer for one invocation (including its response stream). */
export function createMethodContext(
  expired?: number,
  ...signals: (AbortSignal | undefined)[]
): { context: MethodContext; dispose: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Map<AbortSignal, () => void>();
  const dispose = () => {
    clearTimeout(timer);
    listeners.forEach((listener, signal) => signal.removeEventListener('abort', listener));
    listeners.clear();
  };
  const abort = (reason: unknown) => {
    controller.abort(reason);
    dispose();
  };

  for (const signal of signals) {
    if (!signal || listeners.has(signal)) continue;
    if (signal.aborted) {
      abort(signal.reason);
      break;
    }
    const onAbort = () => abort(signal.reason);
    listeners.set(signal, onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
  }

  if (expired !== undefined && !controller.signal.aborted) {
    const remaining = expired - Date.now();
    const onDeadline = () => {
      abort(new DOMException('End-to-end timeout expired', 'TimeoutError'));
    };

    if (remaining <= 0) {
      onDeadline();
    } else {
      timer = setTimeout(onDeadline, remaining);
      timer.unref();
    }
  }

  return {
    context: { signal: controller.signal },
    dispose,
  };
}
