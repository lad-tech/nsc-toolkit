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

export type GetUserRequestV2 = {
  userId: string;
};

export type GetUserResponseV2 = {
  firstName: string;
  lastName: string;
};
