import { DependencyType, ClientService } from '.';
import { dependencyStorageMetaKet } from './injector';

type Constant = Record<string, any>;

type Service<R extends Constant = Constant> = ClientService<R>;
export type Adapter<R extends Constant = Constant> = new () => R;

type Dependency = Service | Adapter | Constant;

type ServiceDependency = { type: typeof DependencyType.SERVICE; value: Service };
type AdapterDependency = { type: typeof DependencyType.ADAPTER; value: Adapter };
type ConstantDependency = { type: typeof DependencyType.CONSTANT; value: Constant };

type ContainerValue = { type: DependencyType; value: Dependency };

class Container {
  private readonly container = new Map<symbol, ContainerValue>();

  private inject(dependency: ContainerValue): ContainerValue {
    if (this.isServiceDependency(dependency)) {
      return dependency;
    }

    const deepDependencies: Map<string, symbol> | undefined = Reflect.getMetadata(
      dependencyStorageMetaKet,
      dependency.value,
    );

    if (deepDependencies && deepDependencies.size) {
      deepDependencies.forEach((key, propertyName) => {
        const deepDependency = this.get(key);

        const dependencyProto = dependency.value.prototype;

        if (this.isAdapterDependency(deepDependency)) {
          dependencyProto[propertyName] = new deepDependency.value();
        }

        if (this.isConstantDependency(deepDependency)) {
          dependencyProto[propertyName] = deepDependency.value;
        }
      });

      return dependency;
    }

    return dependency;
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
  bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.ADAPTER, value: Adapter<R>): void;
  bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.CONSTANT, value: R): void;
  public bind<R extends Record<string, any>>(
    key: symbol,
    type: DependencyType,
    value: ClientService<R> | Adapter<R> | R,
  ) {
    this.container.set(key, { type, value });
  }

  public unbind(key: symbol) {
    this.container.delete(key);
  }

  public get(key: symbol) {
    const dependency = this.container.get(key);

    if (!dependency) {
      throw new Error(`Dependency ${key.toString()} is not bound to the container`);
    }

    return this.inject(dependency);
  }

  public getInstance<R = Constant>(key: symbol): R | null {
    const dependency = this.get(key);

    if (this.isServiceDependency(dependency)) {
      throw new Error(`Unable to get service instance`);
    }

    if (this.isConstantDependency(dependency)) {
      return dependency.value as R;
    }

    if (this.isAdapterDependency(dependency)) {
      return new dependency.value() as R;
    }

    return null;
  }
}

export const container = new Container();
