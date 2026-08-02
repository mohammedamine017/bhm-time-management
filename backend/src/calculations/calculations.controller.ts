import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CalculationsService } from './calculations.service';

@Controller('calculations')
export class CalculationsController {
  constructor(private readonly calculations: CalculationsService) {}

  @Get('status')
  status(@Query('month') month?: string) {
    return this.calculations.status(month);
  }

  @Post('launch')
  launch(@Query('month') month?: string) {
    return this.calculations.launch(month);
  }

  @Get('history')
  history() {
    return this.calculations.history();
  }

  @Get('history/:runId')
  historyRun(@Param('runId') runId: string) {
    return this.calculations.historyRun(runId);
  }

  @Get('history/:runId/export')
  async exportHistory(
    @Param('runId') runId: string,
    @Query('employeeId') employeeId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.calculations.exportHistoryWorkbook(
      runId,
      employeeId,
    );
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get('export')
  async exportAll(
    @Query('month') month: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.calculations.exportWorkbook(month);
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get(':employeeId/export')
  async exportEmployee(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.calculations.exportWorkbook(month, employeeId);
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    return new StreamableFile(file.buffer);
  }
}
