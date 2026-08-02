import { Module } from '@nestjs/common';
import { CalculationsModule } from '../calculations/calculations.module';
import { CyclesModule } from '../cycles/cycles.module';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

@Module({
  imports: [CyclesModule, CalculationsModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
})
export class HolidaysModule {}
