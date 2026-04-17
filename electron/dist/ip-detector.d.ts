export declare class IpDetector {
    /**
     * Lấy địa chỉ IPv4 local của máy (ưu tiên mạng LAN, bỏ qua loopback)
     */
    static getLocalIp(): string;
    /**
     * Lấy hostname của máy
     */
    static getHostname(): string;
    /**
     * Lấy tất cả địa chỉ IPv4 (để debug / hiển thị)
     */
    static getAllLocalIps(): string[];
}
