export const mathHelperInstance = {
  sum: (params: { a: number; b: number }) => Promise.resolve({ result: params.a + params.b }),
};
