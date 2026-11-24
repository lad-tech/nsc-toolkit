export const MathClient = jest.fn().mockImplementation(() => ({
  withSignal() {
    return this;
  },
  sum: (params: { a: number; b: number }) => Promise.resolve({ result: params.a + params.b }),
}));
