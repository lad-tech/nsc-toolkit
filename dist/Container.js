"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
const _1 = require(".");
class Container {
    constructor() {
        this.container = new Map();
        this.singltons = new Map();
    }
    buildDependency(key) {
        const deepDependency = this.get(key);
        if (this.isAdapterDependency(deepDependency.dependency)) {
            return new deepDependency.dependency.value(...deepDependency.constructor);
        }
        if (this.isConstantDependency(deepDependency.dependency)) {
            return deepDependency.dependency.value;
        }
    }
    inject(dependency) {
        if (this.isServiceDependency(dependency)) {
            return { dependency, constructor: [] };
        }
        const deepDependencies = Reflect.getMetadata(_1.dependencyStorageMetaKey, dependency.value);
        if (deepDependencies && deepDependencies.size) {
            const constructor = [];
            deepDependencies.forEach((key, propertyName) => {
                if (Array.isArray(key)) {
                    key.forEach((item, index) => {
                        constructor[index] = this.buildDependency(item);
                    });
                }
                else {
                    dependency.value.prototype[propertyName] = this.buildDependency(key);
                }
            });
            return { dependency, constructor };
        }
        return { dependency, constructor: [] };
    }
    isServiceDependency(dependency) {
        return dependency.type === _1.DependencyType.SERVICE;
    }
    isAdapterDependency(dependency) {
        return dependency.type === _1.DependencyType.ADAPTER;
    }
    isConstantDependency(dependency) {
        return dependency.type === _1.DependencyType.CONSTANT;
    }
    bind(key, type, value, options) {
        this.container.set(key, { type, value, options });
    }
    symbol(key) {
        return {
            to: {
                Adapter: (value, options) => {
                    this.container.set(key, { type: _1.DependencyType.ADAPTER, value, options });
                },
                Singlton: (value) => {
                    this.container.set(key, { type: _1.DependencyType.ADAPTER, value, options: { singlton: true } });
                },
                Constant: (value) => {
                    this.container.set(key, { type: _1.DependencyType.CONSTANT, value, options: { singlton: true } });
                },
                Initializable: (value) => {
                    this.container.set(key, { type: _1.DependencyType.ADAPTER, value, options: { init: true } });
                },
                Service: (value) => {
                    this.container.set(key, { type: _1.DependencyType.SERVICE, value });
                },
            },
        };
    }
    async unbind(key) {
        this.container.delete(key);
        const instance = this.singltons.get(key);
        if (instance === null || instance === void 0 ? void 0 : instance.init) {
            await instance.value.close();
        }
        this.singltons.delete(key);
    }
    get(key) {
        const dependency = this.container.get(key);
        if (!dependency) {
            throw new Error(`Dependency ${key.toString()} is not bound to the container`);
        }
        return this.inject(dependency);
    }
    getInstance(key) {
        var _a, _b, _c;
        const { dependency, constructor } = this.get(key);
        if (this.isServiceDependency(dependency)) {
            throw new Error(`Unable to get service instance`);
        }
        if (this.isConstantDependency(dependency)) {
            return dependency.value;
        }
        if (this.isAdapterDependency(dependency)) {
            if (this.singltons.has(key)) {
                return this.singltons.get(key).value;
            }
            const adapter = new dependency.value(...constructor);
            if (((_a = dependency.options) === null || _a === void 0 ? void 0 : _a.singlton) || ((_b = dependency.options) === null || _b === void 0 ? void 0 : _b.init)) {
                this.singltons.set(key, { value: adapter, init: (_c = dependency.options) === null || _c === void 0 ? void 0 : _c.init });
            }
            return adapter;
        }
        throw new Error(`Unknown dependency type for key ${key.toString()}`);
    }
    async initDependencies() {
        var _a, _b;
        const initialized = [];
        for await (const [key, dependency] of this.container) {
            if (this.isAdapterDependency(dependency) && ((_a = dependency.options) === null || _a === void 0 ? void 0 : _a.init) && !this.singltons.has(key)) {
                const instance = this.getInstance(key);
                await (instance === null || instance === void 0 ? void 0 : instance.init());
                initialized.push(instance);
                this.singltons.set(key, { value: instance, init: (_b = dependency.options) === null || _b === void 0 ? void 0 : _b.init });
            }
        }
        return initialized;
    }
}
exports.container = new Container();
//# sourceMappingURL=Container.js.map