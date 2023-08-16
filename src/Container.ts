import { ClientService, dependencyStorageMetaKey, DependencyType, InitializableService } from '.';

type Constant = Record<string, any>;

type Service<R extends Constant = Constant> = ClientService<R>;
export type Adapter<R extends Constant = Constant> = new (...args: any[]) => R;

export type Singlton = { singlton: true };
export type NeedInit = { init: true };

export type AdapterOptions = Singlton | NeedInit;

type Dependency = Service | Adapter | Constant;

type ServiceDependency = { type: typeof DependencyType.SERVICE; value: Service };
type AdapterDependency = { type: typeof DependencyType.ADAPTER; value: Adapter; options?: Singlton } & {
  type: typeof DependencyType.ADAPTER;
  value: Adapter<InitializableService>;
  options?: NeedInit;
};
type ConstantDependency = { type: typeof DependencyType.CONSTANT; value: Constant };

type ContainerValue = { type: DependencyType; value: Dependency; options?: AdapterOptions };
type SingltonValue = { value: Constant; init?: boolean };

class Container {
  private readonly container = new Map<symbol, ContainerValue>();
  private readonly singltons = new Map<symbol, SingltonValue>();

  private buildDependency(key: symbol) {
    const deepDependency = this.get(key);

    if (this.isAdapterDependency(deepDependency.dependency)) {
      return new deepDependency.dependency.value(...deepDependency.constructor);
    }

    if (this.isConstantDependency(deepDependency.dependency)) {
      return deepDependency.dependency.value;
    }
  }

  private inject(dependency: ContainerValue): { dependency: ContainerValue; constructor: Array<unknown> } {
    if (this.isServiceDependency(dependency)) {
      return { dependency, constructor: [] };
    }

    const deepDependencies: Map<string, symbol | symbol[]> | undefined = Reflect.getMetadata(
      dependencyStorageMetaKey,
      dependency.value,
    );

    if (deepDependencies && deepDependencies.size) {
      const constructor: unknown[] = [];

      deepDependencies.forEach((key, propertyName) => {
        if (Array.isArray(key)) {
          key.forEach((item, index) => {
            constructor[index] = this.buildDependency(item);
          });
        } else {
          dependency.value.prototype[propertyName] = this.buildDependency(key);
        }
      });

      return { dependency, constructor };
    }

    return { dependency, constructor: [] };
  }

  private isServiceDependency(dependency: ContainerValue): dependency is ServiceDependency {
    return dependency.type === DependencyType.SERVICE;
  }

  private isAdapterDependency(dependency: ContainerValue): dependency is AdapterDependency {
    return dependency.type === DependencyType.ADAPTER;
  }

  private isConstantDependency(dependency: ContainerValue): dependency is ConstantDependency {
    return dependency.type === DependencyType.CONSTANT;
  }

  bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.SERVICE, value: ClientService<R>): void;
  bind<R extends Record<string, any>>(
    key: symbol,
    type: typeof DependencyType.ADAPTER,
    value: Adapter<R>,
    options?: Singlton,
  ): void;
  bind<R extends Record<string, any>>(
    key: symbol,
    type: typeof DependencyType.ADAPTER,
    value: Adapter<R & InitializableService>,
    options?: NeedInit,
  ): void;
  bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.CONSTANT, value: R): void;
  public bind<R extends Record<string, any>>(
    key: symbol,
    type: DependencyType,
    value: ClientService<R> | Adapter<R> | R,
    options?: AdapterOptions,
  ) {
    this.container.set(key, { type, value, options });
  }

  public symbol(key: symbol) {
    return {
      to: {
        Adapter: <R extends Record<string, any>>(
          value: Adapter<R> | Adapter<R & InitializableService>,
          options?: AdapterOptions,
        ) => {
          this.container.set(key, { type: DependencyType.ADAPTER, value, options });
        },
        Singlton: <R extends Record<string, any>>(value: Adapter<R>) => {
          this.container.set(key, { type: DependencyType.ADAPTER, value, options: { singlton: true } });
        },
        Constant: <R extends Record<string, any>>(value: R) => {
          this.container.set(key, { type: DependencyType.CONSTANT, value, options: { singlton: true } });
        },
        Initializable: <R extends Record<string, any>>(value: Adapter<R & InitializableService>) => {
          this.container.set(key, { type: DependencyType.ADAPTER, value, options: { init: true } });
        },
        Service: <R extends Record<string, any>>(value: ClientService<R>) => {
          this.container.set(key, { type: DependencyType.SERVICE, value });
        },
      },
    };
  }

  public async unbind(key: symbol) {
    this.container.delete(key);

    const instance = this.singltons.get(key);
    if (instance?.init) {
      await instance.value.close();
    }
    this.singltons.delete(key);
  }

  public get(key: symbol) {
    const dependency = this.container.get(key);

    if (!dependency) {
      throw new Error(`Dependency ${key.toString()} is not bound to the container`);
    }

    return this.inject(dependency);
  }

  public getInstance<R = Constant>(key: symbol): R {
    const { dependency, constructor } = this.get(key);

    if (this.isServiceDependency(dependency)) {
      throw new Error(`Unable to get service instance`);
    }

    if (this.isConstantDependency(dependency)) {
      return dependency.value as R;
    }

    if (this.isAdapterDependency(dependency)) {
      if (this.singltons.has(key)) {
        return this.singltons.get(key)!.value as R;
      }

      const adapter = new dependency.value(...constructor);

      if (dependency.options?.singlton || dependency.options?.init) {
        this.singltons.set(key, { value: adapter, init: dependency.options?.init });
      }

      return adapter as R;
    }

    throw new Error(`Unknown dependency type for key ${key.toString()}`);
  }

  public async initDependencies() {
    const initialized: InitializableService[] = [];
    for await (const [key, dependency] of this.container) {
      if (this.isAdapterDependency(dependency) && dependency.options?.init && !this.singltons.has(key)) {
        const instance = this.getInstance<InitializableService>(key);
        await instance?.init();
        initialized.push(instance!);
        this.singltons.set(key, { value: instance, init: dependency.options?.init });
      }
    }
    return initialized;
  }
}

export const container = new Container();
