import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtUserPayload } from '../auth/auth.types';
import type { CreateHistoryDto } from './dto/create-history.dto';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  getHistory(@Query('stageCode') stageCode?: string) {
    return this.historyService.listHistory(stageCode);
  }

  @Post()
  createHistory(@Body() payload: CreateHistoryDto) {
    return this.historyService.createHistory(payload);
  }

  @Patch('commit')
  commitHistory(@Body('stageCode') stageCode: string) {
    return this.historyService.commitHistory(stageCode);
  }

  @Delete(':id')
  deleteHistory(
    @Param('id') id: string,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.historyService.deleteHistory(id, request.user);
  }
}
