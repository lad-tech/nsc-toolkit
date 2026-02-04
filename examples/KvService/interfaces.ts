// Типы запроса/ответа для метода GetSet (пример использования KV)

export interface GetSetRequest {
  key: string;
  value?: string;
  /** При get — читать указанную версию ключа (revision) */
  revision?: number;
}

export interface GetSetResponse {
  key: string;
  value?: string;
  revision?: number;
}
