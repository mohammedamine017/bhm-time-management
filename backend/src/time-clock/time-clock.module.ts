import { Module } from '@nestjs/common';
import { CalculationsModule } from '../calculations/calculations.module';
import { CyclesModule } from '../cycles/cycles.module';
import { ScansModule } from '../scans/scans.module';
import { TimeClockFileParserService } from './time-clock-file-parser.service';
import { TimeClockController } from './time-clock.controller';
import { TimeClockService } from './time-clock.service';

@Module({
  imports: [CyclesModule, ScansModule, CalculationsModule],
  controllers: [TimeClockController],
  providers: [TimeClockService, TimeClockFileParserService],
})
export class TimeClockModule {}
