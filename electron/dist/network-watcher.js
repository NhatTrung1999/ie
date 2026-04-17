"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkWatcher = void 0;
const dns_1 = __importDefault(require("dns"));
class NetworkWatcher {
    constructor(onOnline, onOffline, checkIntervalMs = 30000, testHost = '8.8.8.8') {
        this.intervalId = null;
        this._isOnline = false;
        this.onOnline = onOnline;
        this.onOffline = onOffline;
        this.checkIntervalMs = checkIntervalMs;
        this.testHost = testHost;
    }
    start() {
        // Check ngay lần đầu
        void this.check();
        this.intervalId = setInterval(() => {
            void this.check();
        }, this.checkIntervalMs);
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    isOnline() {
        return this._isOnline;
    }
    async check() {
        const wasOnline = this._isOnline;
        this._isOnline = await this.testConnectivity();
        if (!wasOnline && this._isOnline) {
            // Vừa có mạng
            this.onOnline();
        }
        else if (wasOnline && !this._isOnline) {
            // Vừa mất mạng
            this.onOffline();
        }
    }
    testConnectivity() {
        return new Promise((resolve) => {
            dns_1.default.lookup(this.testHost, (err) => {
                resolve(!err);
            });
        });
    }
}
exports.NetworkWatcher = NetworkWatcher;
//# sourceMappingURL=network-watcher.js.map