import { Module } from '@nestjs/common';
import { CalculationsModule } from '../calculations/calculations.module';
import { CyclesModule } from '../cycles/cycles.module';
import { ClaudeExtractionService } from './claude-extraction.service';
import { ScansController } from './scans.controller';
import { ScanStorageService } from './scan-storage.service';
import { ScansService } from './scans.service';

@Module({
  imports: [CyclesModule, CalculationsModule],
  controllers: [ScansController],
  providers: [ScansService, ScanStorageService, ClaudeExtractionService],
  exports: [ScanStorageService],
})
export class ScansModule {}
