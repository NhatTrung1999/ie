import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Express, Request } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';

import type { JwtUserPayload } from '../auth/auth.types';
import type { CreateStageDto } from './dto/create-stage.dto';
import type { DuplicateStageDto } from './dto/duplicate-stage.dto';
import type { ListStagesDto } from './dto/list-stages.dto';
import type { ReorderStageDto } from './dto/reorder-stage.dto';
import { stageUploadStorage } from './stage-upload.util';
import { StageService } from './stage.service';

@Controller('stages')
export class StageController {
  constructor(private readonly stageService: StageService) {}

  @Get()
  getStages(@Query() filters: ListStagesDto) {
    return this.stageService.listStages(filters);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: stageUploadStorage,
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype?.startsWith('video/')) {
          callback(
            new BadRequestException(
              `Unsupported file type "${file.mimetype}". Only video files are allowed.`,
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        files: 5,
        fileSize: 250 * 1024 * 1024,
      },
    }),
  )
  createStages(
    @Body() payload: CreateStageDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.stageService.createStages(payload, files);
  }

  @Post('duplicate')
  duplicateStage(@Body() payload: DuplicateStageDto) {
    return this.stageService.duplicateStage(payload);
  }

  @Patch('reorder')
  reorderStages(@Body() payload: ReorderStageDto) {
    return this.stageService.reorderStages(payload);
  }

  @Delete(':id')
  deleteStage(
    @Param('id') id: string,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.stageService.deleteStage(id, request.user);
  }
}
