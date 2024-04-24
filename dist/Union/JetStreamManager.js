"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jetStreamManagerBlank = exports.JetStreamManagerBlank = void 0;
const StreamApi_1 = require("./StreamApi");
class JetStreamManagerBlank {
    constructor() {
        this.streams = new StreamApi_1.StreamApiBlank();
    }
    getAccountInfo() {
        throw new Error('Method getAccountInfo not implemented.');
    }
    advisories() {
        throw new Error('Method advisories not implemented.');
    }
}
exports.JetStreamManagerBlank = JetStreamManagerBlank;
exports.jetStreamManagerBlank = new JetStreamManagerBlank();
//# sourceMappingURL=JetStreamManager.js.map