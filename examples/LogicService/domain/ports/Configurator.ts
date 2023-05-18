export interface ConfiguratorPort {
  setUserId(userId: string): Promise<void>;
  userIdExist(userId: string): Promise<boolean>;
}
