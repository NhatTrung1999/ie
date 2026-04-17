"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpDetector = void 0;
const os_1 = __importDefault(require("os"));
class IpDetector {
    /**
     * Lấy địa chỉ IPv4 local của máy (ưu tiên mạng LAN, bỏ qua loopback)
     */
    static getLocalIp() {
        const interfaces = os_1.default.networkInterfaces();
        for (const [name, nets] of Object.entries(interfaces)) {
            if (!nets)
                continue;
            // Bỏ qua các interface ảo, VPN, Docker
            if (/vmware|virtualbox|docker|vethernet|loopback/i.test(name))
                continue;
            for (const net of nets) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        // Fallback: lấy địa chỉ đầu tiên tìm được
        for (const nets of Object.values(interfaces)) {
            if (!nets)
                continue;
            for (const net of nets) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return '127.0.0.1';
    }
    /**
     * Lấy hostname của máy
     */
    static getHostname() {
        return os_1.default.hostname();
    }
    /**
     * Lấy tất cả địa chỉ IPv4 (để debug / hiển thị)
     */
    static getAllLocalIps() {
        const interfaces = os_1.default.networkInterfaces();
        const ips = [];
        for (const nets of Object.values(interfaces)) {
            if (!nets)
                continue;
            for (const net of nets) {
                if (net.family === 'IPv4' && !net.internal) {
                    ips.push(net.address);
                }
            }
        }
        return ips;
    }
}
exports.IpDetector = IpDetector;
//# sourceMappingURL=ip-detector.js.map