import { Consumer, ConsumerMessages, JsMsg } from 'nats';

export class StreamSingleMsgFetcher {
  private done = false;

  constructor(private consumer: Consumer) {}

  [Symbol.asyncIterator]() {
    return {
      next: async () => {
        const msg = await this.consumer.next();
        if (msg) {
          return {
            value: msg,
            done: this.done,
          };
        }

        return { done: false };
      },
    };
  }

  public unsubscribe() {
    this.done = true;
  }
}
