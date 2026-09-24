import type { MethodContext } from './interfaces';

/** Owns the deadline timer for one invocation (including its response stream). */
export function createMethodContext(expired?: number): { context: MethodContext; dispose: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (expired !== undefined) {
    const remaining = expired - Date.now();
    const abort = () => {
      controller.abort(new DOMException('End-to-end timeout expired', 'TimeoutError'));
    };

    if (remaining <= 0) {
      abort();
    } else {
      timer = setTimeout(abort, remaining);
      timer.unref();
    }
  }

  return {
    context: { signal: controller.signal },
    dispose: () => clearTimeout(timer),
  };
}
