import { Module } from '@nestjs/common';
import { CyclesModule } from '../cycles/cycles.module';
import { CalculationEngineService } from './calculation-engine.service';
import { CalculationsController } from './calculations.controller';
import { CalculationsService } from './calculations.service';

@Module({
  imports: [CyclesModule],
  controllers: [CalculationsController],
  providers: [CalculationsService, CalculationEngineService],
  exports: [CalculationsService],
})
export class CalculationsModule {}
