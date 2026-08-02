import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { CyclesModule } from './cycles/cycles.module';
import { EmployeesModule } from './employees/employees.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScansModule } from './scans/scans.module';
import { TimeClockModule } from './time-clock/time-clock.module';
import { CalculationsModule } from './calculations/calculations.module';
import { HolidaysModule } from './holidays/holidays.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  // Keep each MVP phase registered as an explicit vertical module.
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    PrismaModule,
    CyclesModule,
    EmployeesModule,
    ScansModule,
    TimeClockModule,
    CalculationsModule,
    HolidaysModule,
    DocumentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
