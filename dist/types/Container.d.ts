import { ClientService, DependencyType, InitializableService } from '.';
type Constant = Record<string, any>;
type Service<R extends Constant = Constant> = ClientService<R>;
export type Adapter<R extends Constant = Constant> = new (...args: any[]) => R;
export type Singlton = {
    singlton: true;
};
export type NeedInit = {
    init: true;
};
export type AdapterOptions = Singlton | NeedInit;
type Dependency = Service | Adapter | Constant;
type ContainerValue = {
    type: DependencyType;
    value: Dependency;
    options?: AdapterOptions;
};
declare class Container {
    private readonly container;
    private readonly singltons;
    private buildDependency;
    private inject;
    private isServiceDependency;
    private isAdapterDependency;
    private isConstantDependency;
    bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.SERVICE, value: ClientService<R>): void;
    bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.ADAPTER, value: Adapter<R>, options?: Singlton): void;
    bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.ADAPTER, value: Adapter<R & InitializableService>, options?: NeedInit): void;
    bind<R extends Record<string, any>>(key: symbol, type: typeof DependencyType.CONSTANT, value: R): void;
    symbol(key: symbol): {
        to: {
            Adapter: <R extends Record<string, any>>(value: Adapter<R> | Adapter<R & import("./interfaces").GracefulShutdownAdditionalService & {
                init: () => Promise<any>;
            }>, options?: AdapterOptions) => void;
            Singlton: <R_1 extends Record<string, any>>(value: Adapter<R_1>) => void;
            Constant: <R_2 extends Record<string, any>>(value: R_2) => void;
            Initializable: <R_3 extends Record<string, any>>(value: Adapter<R_3 & import("./interfaces").GracefulShutdownAdditionalService & {
                init: () => Promise<any>;
            }>) => void;
            Service: <R_4 extends Record<string, any>>(value: ClientService<R_4>) => void;
        };
    };
    unbind(key: symbol): Promise<void>;
    get(key: symbol): {
        dependency: ContainerValue;
        constructor: unknown[];
    };
    getInstance<R = Constant>(key: symbol): R;
    initDependencies(): Promise<InitializableService[]>;
}
export declare const container: Container;
export {};
