import 'reflect-metadata';
import { Method, ClientService } from './interfaces';

export type Instance = Record<string, (props: unknown) => Promise<unknown>>;
export type Dependence = ClientService<unknown>;
export type DependenceStorage = Map<string, Dependence>;
export type InstanceStorage = Map<string, Instance>;

const serviceMetaKey = Symbol('services');
const instanceMetaKey = Symbol('instance');

export const ServiceContainer: Map<string, DependenceStorage> = new Map();
export const InstanceContainer: Map<string, InstanceStorage> = new Map();

export function related<T extends Method>(target: T) {
  const dependencies: DependenceStorage = Reflect.getMetadata(serviceMetaKey, target.prototype);
  const instances: InstanceStorage = Reflect.getMetadata(instanceMetaKey, target.prototype);
  ServiceContainer.set(target.settings.action, dependencies);
  InstanceContainer.set(target.settings.action, instances);
}

function setMetaData(item: Dependence | Instance, itemName: string, metaKey: symbol, target: any) {
  let storage: Map<string, unknown>;
  if (Reflect.hasMetadata(metaKey, target)) {
    storage = Reflect.getMetadata(metaKey, target);
  } else {
    storage = new Map();
    Reflect.defineMetadata(metaKey, storage, target);
  }
  storage.set(itemName, item);
}

export function service(dependence: Dependence) {
  return function (target: any, dependenceName: string): void {
    setMetaData(dependence, dependenceName, serviceMetaKey, target);
  };
}

export function instance(instance: Instance) {
  return function (target: any, instanceName: string): void {
    setMetaData(instance, instanceName, instanceMetaKey, target);
  };
}
