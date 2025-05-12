import { Baggage, EventMeter, Tag, TagKey } from './interfaces';
import * as opentelemetry from '@opentelemetry/api';
import { Root } from './Root';

export class Meter extends Root implements EventMeter {
  private span?: opentelemetry.Span;
  constructor(private name: string, private baggage?: Baggage) {
    super();
  }
  public start() {
    const tracer = opentelemetry.trace.getTracer('');
    this.span = tracer.startSpan(this.name, { kind: opentelemetry.SpanKind.CONSUMER }, this.getContext(this.baggage));
  }
  public end(error?: Error) {
    if (!this.span) {
      return;
    }

    if (error) {
      this.span.setAttribute('error', true);
      this.span.setAttribute('error.kind', error.message);
    }

    this.span.end();
  }

  public measure<T extends (...args: any[]) => any>(
    func: T,
    arg: Parameters<T>,
    context: unknown,
    tag?: Tag,
  ): ReturnType<T> {
    const tracer = opentelemetry.trace.getTracer('');
    let spanContext: opentelemetry.Context | undefined;
    if (this.span) {
      spanContext = opentelemetry.trace.setSpan(opentelemetry.context.active(), this.span);
    }
    const options: { kind?: opentelemetry.SpanKind } = { kind: opentelemetry.SpanKind.INTERNAL };
    if (tag?.[TagKey.LOCATION] === 'external') {
      options.kind = opentelemetry.SpanKind.CLIENT;
    }

    const span = tracer.startSpan(func.name, options, spanContext);
    this.applyTag(span, tag);

    const result = func.apply(context, arg);
    if (result.then) {
      return result.then(
        (result: any) => {
          span.end();
          return result;
        },
        (error: Error) => {
          span.setAttribute('error', true);
          span.setAttribute('error.kind', error.message);
          span.end();
          throw error;
        },
      );
    } else {
      span.end();
    }
    return result;
  }
}
