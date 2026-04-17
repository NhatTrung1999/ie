import { Controller, Get, Post, Body } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('run')
  async runSync() {
    return this.syncService.runSync();
  }

  @Get('status')
  getStatus() {
    return this.syncService.getStatus();
  }

  @Post('import')
  async importData(
    @Body() body: { stages: any[]; tableCt: any[]; history: any[] },
  ) {
    return this.syncService.importData(body);
  }
}
