import os from 'os';

export class IpDetector {
  /**
   * Lấy địa chỉ IPv4 local của máy (ưu tiên mạng LAN, bỏ qua loopback)
   */
  static getLocalIp(): string {
    const interfaces = os.networkInterfaces();

    for (const [name, nets] of Object.entries(interfaces)) {
      if (!nets) continue;

      // Bỏ qua các interface ảo, VPN, Docker
      if (/vmware|virtualbox|docker|vethernet|loopback/i.test(name)) continue;

      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }

    // Fallback: lấy địa chỉ đầu tiên tìm được
    for (const nets of Object.values(interfaces)) {
      if (!nets) continue;
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
  static getHostname(): string {
    return os.hostname();
  }

  /**
   * Lấy tất cả địa chỉ IPv4 (để debug / hiển thị)
   */
  static getAllLocalIps(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];

    for (const nets of Object.values(interfaces)) {
      if (!nets) continue;
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }

    return ips;
  }
}
