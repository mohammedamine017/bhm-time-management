import {
  Controller,
  Delete,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service';

interface EmployeeFile {
  originalname: string;
  buffer: Buffer;
}

@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('employees/active')
  active() {
    return this.employees.active();
  }

  @Get('employee-imports/history')
  history() {
    return this.employees.history();
  }

  @Post('employee-imports/preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(@UploadedFile() file: EmployeeFile) {
    return this.employees.preview(file);
  }

  @Post('employee-imports/confirm')
  @UseInterceptors(FileInterceptor('file'))
  confirm(@UploadedFile() file: EmployeeFile) {
    return this.employees.confirm(file);
  }

  @Delete('employee-imports/active')
  removeActive() {
    return this.employees.removeActive();
  }
}
