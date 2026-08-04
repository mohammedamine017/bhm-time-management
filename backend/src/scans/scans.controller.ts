import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UpdateExtractedDayDto } from './dto/update-extracted-day.dto';
import { ScansService } from './scans.service';

@Controller('scans')
export class ScansController {
  constructor(
    private readonly scans: ScansService,
    private readonly config: ConfigService,
  ) {}

  @Get('qr')
  qr() {
    return this.scans.qr(
      this.config.get('MOBILE_SCAN_URL', 'http://127.0.0.1:4202/mobile-scan'),
    );
  }

  @Get('latest')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  latest(@Query('month') month?: string) {
    return this.scans.latest(month);
  }

  @Patch('rows/:rowId/days/:date')
  updateDay(
    @Param('rowId') rowId: string,
    @Param('date') date: string,
    @Body() input: UpdateExtractedDayDto,
  ) {
    return this.scans.updateDay(rowId, date, input.value);
  }

  @Post('batches')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files', 12, { limits: { fileSize: 12 * 1024 * 1024 } }))
  upload(
    @UploadedFiles()
    files: { originalname: string; buffer: Buffer; mimetype: string; size: number }[],
    @Query('month') month?: string,
  ) {
    return this.scans.upload(files, month);
  }

  @Post('documents/:documentId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@Param('documentId') documentId: string) {
    return this.scans.retryDocument(documentId);
  }
}
