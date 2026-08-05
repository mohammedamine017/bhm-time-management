import {
  Controller,
  Body,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TimeClockService } from './time-clock.service';
import type { UploadedTimeClockFile } from './time-clock.types';

@Controller('time-clock-reports')
export class TimeClockController {
  constructor(private readonly reports: TimeClockService) {}

  @Get()
  list(@Query('month') month?: string) {
    return this.reports.list(month);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  import(
    @UploadedFiles() files: UploadedTimeClockFile[],
    @Query('month') month?: string,
  ) {
    return this.reports.import(files, month);
  }

  @Patch(':entryId/days/:date')
  updateDay(
    @Param('entryId') entryId: string,
    @Param('date') date: string,
    @Body() body: { durationMinutes: number },
  ) {
    return this.reports.updateDay(entryId, date, body.durationMinutes);
  }
}
