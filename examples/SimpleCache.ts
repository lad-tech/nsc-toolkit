export class SimpleCache {
  private map = new Map<string, string>();

  public async get(key: string) {
    return this.map.get(key);
  }

  public async delete(key: string) {
    this.map.delete(key);
    return;
  }

  public async set(key: string, data: string, expired?: number) {
    this.map.set(key, data);
    if (expired) {
      setTimeout(() => {
        this.map.delete(key);
      }, expired * 60 * 1000);
    }
  }
}
