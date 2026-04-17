import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Đăng ký hoặc cập nhật identity của thiết bị hiện tại
   * Dùng IP + hostname để nhận diện thay cho username/password
   */
  async registerDevice(): Promise<{ ip: string; hostname: string }> {
    const ip = this.getLocalIp();
    const hostname = os.hostname();

    // Upsert: nếu đã có record cho IP này thì update, không thì tạo mới
    await (this.prisma as any).deviceIdentity.upsert({
      where: { ip_hostname: { ip, hostname } },
      update: { updatedAt: new Date() },
      create: { ip, hostname },
    }).catch(async () => {
      // Fallback nếu unique constraint khác
      const existing = await (this.prisma as any).deviceIdentity.findFirst({
        where: { ip },
      });
      if (!existing) {
        await (this.prisma as any).deviceIdentity.create({
          data: { ip, hostname },
        });
      }
    });

    return { ip, hostname };
  }

  async getIdentity(): Promise<{ ip: string; hostname: string }> {
    const ip = this.getLocalIp();
    const hostname = os.hostname();
    return { ip, hostname };
  }

  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();

    for (const [name, nets] of Object.entries(interfaces)) {
      if (!nets) continue;
      if (/vmware|virtualbox|docker|vethernet|loopback/i.test(name)) continue;

      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }

    // Fallback
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
}
