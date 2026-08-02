import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TimeClockService } from './time-clock.service';
import type { UploadedTimeClockFile } from './time-clock.types';
import { UpdateTimeClockDayDto } from './dto/update-time-clock-day.dto';

@Controller('time-clock-reports')
export class TimeClockController {
  constructor(private readonly timeClock: TimeClockService) {}

  @Get('required')
  required(@Query('month') month?: string) {
    return this.timeClock.required(month);
  }

  @Post(':employeeId')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }),
  )
  import(
    @Param('employeeId') employeeId: string,
    @UploadedFile() file: UploadedTimeClockFile,
    @Query('month') month?: string,
  ) {
    return this.timeClock.import(employeeId, file, month);
  }

  @Patch(':reportId/days/:date')
  updateDay(
    @Param('reportId') reportId: string,
    @Param('date') date: string,
    @Body() input: UpdateTimeClockDayDto,
  ) {
    return this.timeClock.updateDay(reportId, date, input.value);
  }
}
