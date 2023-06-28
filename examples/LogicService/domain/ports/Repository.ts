export interface RepositoryPort {
  getUserById(userId: string): Promise<{ firstName: string; lastName: string } | null>;
}
