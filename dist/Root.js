"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Root = void 0;
const toolbelt_1 = require("@lad-tech/toolbelt");
const opentelemetry = require("@opentelemetry/api");
const Union_1 = require("./Union");
class Root {
    constructor(broker, outputFormatter) {
        this.SERVICE_SUBJECT_FOR_GET_HTTP_SETTINGS = 'get_http_settings';
        this.CACHE_SERVICE_KEY = 'CACHE';
        this.SUBJECT_DELIMITER = '.';
        if (!broker) {
            this.broker = new Union_1.UnionBroker();
        }
        else {
            this.broker = broker;
        }
        this.logger = new toolbelt_1.Logs.Logger({ outputFormatter });
    }
    castToNumber(value) {
        const result = +value;
        if (isNaN(result)) {
            throw new Error(`Невозможно привести значение ${value} к числу`);
        }
        return result;
    }
    getSettingFromEnv(name, required = true) {
        const value = process.env[name];
        if (!value && required) {
            throw new Error(`Не установлена обязательная настройка: ${name}`);
        }
        return value;
    }
    /**
     * Make opentelemetry context from baggagge
     */
    getContext(baggage) {
        if (baggage) {
            return opentelemetry.trace.setSpanContext(opentelemetry.context.active(), baggage);
        }
    }
    getExpired(expired, ownTimeout) {
        try {
            if (!expired) {
                const timeout = ownTimeout || this.castToNumber(this.getSettingFromEnv('DEFAULT_REPONSE_TIMEOUT'));
                return Date.now() + timeout;
            }
            if (ownTimeout) {
                const customExpired = Date.now() + ownTimeout;
                return Math.min(customExpired, expired);
            }
            return expired;
        }
        catch (error) {
            console.error(error);
            process.exit(1);
        }
    }
    buildErrorMessage(error, code) {
        let message = '';
        if (error instanceof Error) {
            message = error.message;
        }
        else if (typeof error === 'string') {
            message = error;
        }
        else {
            message = JSON.stringify(error);
        }
        return {
            payload: null,
            error: {
                message,
                code,
            },
        };
    }
}
exports.Root = Root;
//# sourceMappingURL=Root.js.map