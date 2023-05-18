// SERVICE

export type WeirdSumRequest = {
  a: number;
  b: number;
};

export type WeirdSumResponse = {
  result: number;
};

export type GetUserRequest = {
  userId: string;
};

export type GetUserResponse = {
  firstName: string;
  lastName: string;
};
