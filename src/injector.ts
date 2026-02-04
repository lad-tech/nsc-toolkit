import 'reflect-metadata';
import { Method, ClientService } from './interfaces';

export type Instance = Record<string, (props: any) => Promise<unknown>>;
export type Dependency = ClientService<unknown>;
export type DependenceStorage = Map<string, Dependency>;
export type InstanceStorage = Map<string, Instance>;

const serviceMetaKey = Symbol('services');
const instanceMetaKey = Symbol('instance');

export const dependencyStorageMetaKey = Symbol('dependency');

/** Метаданные для инъекции KV-бакета: имя свойства метода → имя бакета */
export const kvBucketMetaKey = Symbol('kvBucket');

export const ServiceContainer: Map<string, DependenceStorage> = new Map();
export const InstanceContainer: Map<string, InstanceStorage> = new Map();

export const ConstructorDependencyKey = 'constructor';

interface MetaDataParam {
  item: Dependency | Instance | symbol;
  itemName: string | symbol;
  metaKey: symbol;
  target: any;
  index?: number;
}

export function related<T extends Method>(target: T) {
  const dependencies: DependenceStorage = Reflect.getMetadata(serviceMetaKey, target.prototype);
  const instances: InstanceStorage = Reflect.getMetadata(instanceMetaKey, target.prototype);
  ServiceContainer.set(target.settings.action, dependencies);
  InstanceContainer.set(target.settings.action, instances);
}

function setMetaData({ item, itemName, metaKey, target, index }: MetaDataParam) {
  let storage: Map<string | symbol, unknown>;

  if (Reflect.hasMetadata(metaKey, target)) {
    storage = Reflect.getMetadata(metaKey, target);
  } else {
    storage = new Map();
    Reflect.defineMetadata(metaKey, storage, target);
  }

  if (typeof index === 'number') {
    let constructor: Array<symbol | Dependency | Instance>;

    if (storage.has(ConstructorDependencyKey)) {
      constructor = storage.get(ConstructorDependencyKey) as Array<symbol>;
    } else {
      constructor = [];
      storage.set(ConstructorDependencyKey, constructor);
    }

    constructor[index] = item;
    return;
  }

  storage.set(itemName, item);
}

export function service(dependence: Dependency) {
  return function (target: any, dependenceName: string): void {
    setMetaData({ item: dependence, itemName: dependenceName, metaKey: serviceMetaKey, target });
  };
}

export function instance(instance: Instance) {
  return function (target: any, instanceName: string): void {
    setMetaData({ item: instance, itemName: instanceName, metaKey: instanceMetaKey, target });
  };
}

export function inject(key: symbol) {
  return function (target: any, property: string | symbol | undefined, index?: number): void {
    setMetaData({
      item: key,
      itemName: property!,
      metaKey: dependencyStorageMetaKey,
      target: typeof index === 'number' ? target : target.constructor,
      index,
    });
  };
}

/**
 * Декоратор для инъекции KV-бакета в метод сервиса.
 * Имя бакета должно быть объявлено в service.schema.json → kvBuckets.
 * В handler доступен this[bucketPropertyName] с API get/put/delete/watch.
 */
export function kv(bucketName: string) {
  return function (target: any, propertyName: string): void {
    let storage: Map<string, string>;
    if (Reflect.hasMetadata(kvBucketMetaKey, target.constructor)) {
      storage = Reflect.getMetadata(kvBucketMetaKey, target.constructor);
    } else {
      storage = new Map();
      Reflect.defineMetadata(kvBucketMetaKey, storage, target.constructor);
    }
    storage.set(propertyName, bucketName);
  };
}
