import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { HolidaysService } from './holidays.service';

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  list(@Query('month') month?: string) {
    return this.holidays.list(month);
  }

  @Post()
  create(@Body() input: CreateHolidayDto, @Query('month') month?: string) {
    return this.holidays.create(input.date, input.label, month);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('month') month?: string) {
    return this.holidays.remove(id, month);
  }
}
