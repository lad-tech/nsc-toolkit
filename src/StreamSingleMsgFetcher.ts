import { Consumer, ConsumerMessages, JsMsg } from 'nats';

export class StreamSingleMsgFetcher {
  private done = false;
  private msg: JsMsg;

  constructor(private consumer: Consumer) {}

  [Symbol.asyncIterator]() {
    const done = {
      value: this.msg,
      done: true,
    };

    return {
      next: async () => {
        const msg = await this.consumer.next();
        if (msg) {
          this.msg = msg;
          return {
            value: this.msg,
            done: this.done,
          };
        }

        return done;
      },
    };
  }

  public unsubscribe() {
    this.done = true;
  }
}
