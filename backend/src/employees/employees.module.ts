import { Module } from '@nestjs/common';
import { EmployeeFilesService } from './employee-files.service';
import { EmployeeImportParser } from './employee-import.parser';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeImportParser, EmployeeFilesService],
})
export class EmployeesModule {}
