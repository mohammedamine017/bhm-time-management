import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CyclesService } from './cycles.service';

@Controller('cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get('active')
  getActive(@Query('month') month?: string) {
    return this.cycles.getOrCreateActive(month);
  }

  @Post('reset')
  reset(
    @Query('month') month: string | undefined,
    @Body() input: { resetEmployees?: boolean },
  ) {
    return this.cycles.reset(month, Boolean(input.resetEmployees));
  }
}
