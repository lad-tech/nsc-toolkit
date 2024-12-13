import { BufferToJsonTransform } from '../StreamOptions/BufferToJsonTransform';
import { Readable } from 'node:stream';

function* fixture() {
  yield '[{ "id":0,"title":"title","data":';
  yield '"data"},{"id":1,"title":"title","data":"data"},';
  yield '{"id":2,"title":"title","data":"data"}]';
}

const reference = [
  { data: 'data', id: 0, title: 'title' },
  { data: 'data', id: 1, title: 'title' },
  { data: 'data', id: 2, title: 'title' },
];

describe('BufferToJsonTransform helper class', () => {
  test('correct work', async () => {
    const inputStream = Readable.from(fixture());
    const toJson = new BufferToJsonTransform({});
    const outputStream = inputStream.pipe(toJson);
    const result: Record<string, unknown>[][] = [];

    for await (const chunk of outputStream) {
      result.push(chunk);
    }

    expect(result[0]).toEqual(reference);
  });
});
