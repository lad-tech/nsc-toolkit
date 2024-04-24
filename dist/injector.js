"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.instance = exports.service = exports.related = exports.ConstructorDependencyKey = exports.InstanceContainer = exports.ServiceContainer = exports.dependencyStorageMetaKey = void 0;
require("reflect-metadata");
const serviceMetaKey = Symbol('services');
const instanceMetaKey = Symbol('instance');
exports.dependencyStorageMetaKey = Symbol('dependency');
exports.ServiceContainer = new Map();
exports.InstanceContainer = new Map();
exports.ConstructorDependencyKey = 'constructor';
function related(target) {
    const dependencies = Reflect.getMetadata(serviceMetaKey, target.prototype);
    const instances = Reflect.getMetadata(instanceMetaKey, target.prototype);
    exports.ServiceContainer.set(target.settings.action, dependencies);
    exports.InstanceContainer.set(target.settings.action, instances);
}
exports.related = related;
function setMetaData({ item, itemName, metaKey, target, index }) {
    let storage;
    if (Reflect.hasMetadata(metaKey, target)) {
        storage = Reflect.getMetadata(metaKey, target);
    }
    else {
        storage = new Map();
        Reflect.defineMetadata(metaKey, storage, target);
    }
    if (typeof index === 'number') {
        let constructor;
        if (storage.has(exports.ConstructorDependencyKey)) {
            constructor = storage.get(exports.ConstructorDependencyKey);
        }
        else {
            constructor = [];
            storage.set(exports.ConstructorDependencyKey, constructor);
        }
        constructor[index] = item;
        return;
    }
    storage.set(itemName, item);
}
function service(dependence) {
    return function (target, dependenceName) {
        setMetaData({ item: dependence, itemName: dependenceName, metaKey: serviceMetaKey, target });
    };
}
exports.service = service;
function instance(instance) {
    return function (target, instanceName) {
        setMetaData({ item: instance, itemName: instanceName, metaKey: instanceMetaKey, target });
    };
}
exports.instance = instance;
function inject(key) {
    return function (target, property, index) {
        setMetaData({
            item: key,
            itemName: property,
            metaKey: exports.dependencyStorageMetaKey,
            target: typeof index === 'number' ? target : target.constructor,
            index,
        });
    };
}
exports.inject = inject;
//# sourceMappingURL=injector.js.map