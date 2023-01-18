export const MathClient = jest.fn().mockImplementation(() => ({
  sum: (params: { a: number; b: number }) => Promise.resolve({ result: params.a + params.b }),
}));
