import 'reflect-metadata';
import { Method, ClientService } from './interfaces';
export type Instance = Record<string, (props: any) => Promise<unknown>>;
export type Dependency = ClientService<unknown>;
export type DependenceStorage = Map<string, Dependency>;
export type InstanceStorage = Map<string, Instance>;
export declare const dependencyStorageMetaKey: unique symbol;
export declare const ServiceContainer: Map<string, DependenceStorage>;
export declare const InstanceContainer: Map<string, InstanceStorage>;
export declare const ConstructorDependencyKey = "constructor";
export declare function related<T extends Method>(target: T): void;
export declare function service(dependence: Dependency): (target: any, dependenceName: string) => void;
export declare function instance(instance: Instance): (target: any, instanceName: string) => void;
export declare function inject(key: symbol): (target: any, property: string | symbol | undefined, index?: number) => void;