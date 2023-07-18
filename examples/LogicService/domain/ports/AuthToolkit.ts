export interface AuthToolkitPort {
  getId(): string;
  getHash(password: string): Promise<string>;
}
