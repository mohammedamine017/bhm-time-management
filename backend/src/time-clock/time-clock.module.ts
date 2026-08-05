import { Module } from '@nestjs/common';
import { CyclesModule } from '../cycles/cycles.module';
import { CalculationsModule } from '../calculations/calculations.module';
import { TimeClockController } from './time-clock.controller';
import { TimeClockFilesService } from './time-clock-files.service';
import { TimeClockParserService } from './time-clock-parser.service';
import { TimeClockService } from './time-clock.service';

@Module({
  imports: [CyclesModule, CalculationsModule],
  controllers: [TimeClockController],
  providers: [
    TimeClockService,
    TimeClockParserService,
    TimeClockFilesService,
  ],
})
export class TimeClockModule {}
