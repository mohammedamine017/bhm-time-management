import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeFilesService } from './employee-files.service';
import {
  EmployeeImportParser,
  ParsedEmployee,
} from './employee-import.parser';

interface UploadedEmployeeFile {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: EmployeeImportParser,
    private readonly files: EmployeeFilesService,
  ) {}

  async active() {
    return this.prisma.employeeListImport.findFirst({
      where: { status: ImportStatus.ACTIVE },
      include: {
        employees: {
          where: { isExternal: false },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        },
      },
      orderBy: { importedAt: 'desc' },
    });
  }

  async history() {
    return this.prisma.employeeListImport.findMany({
      select: {
        id: true,
        fileName: true,
        status: true,
        importedAt: true,
        archivedAt: true,
        storageUrl: true,
      },
      orderBy: { importedAt: 'desc' },
    });
  }

  async preview(file: UploadedEmployeeFile) {
    this.requireFile(file);
    const employees = await this.parser.parse(file.buffer);
    const current = await this.prisma.employee.findMany({
      where: {
        isExternal: false,
        listImport: { status: ImportStatus.ACTIVE },
      },
      select: { matricule: true, firstName: true, lastName: true },
    });
    const currentByMatricule = new Map(
      current.map((employee) => [employee.matricule, employee]),
    );

    return {
      fileName: file.originalname,
      total: employees.length,
      newCount: employees.filter(
        (employee) => !currentByMatricule.has(employee.matricule),
      ).length,
      updatedCount: employees.filter((employee) => {
        const match = currentByMatricule.get(employee.matricule);
        return (
          match &&
          (match.firstName !== employee.firstName ||
            match.lastName !== employee.lastName)
        );
      }).length,
      unchangedCount: employees.filter((employee) => {
        const match = currentByMatricule.get(employee.matricule);
        return (
          match &&
          match.firstName === employee.firstName &&
          match.lastName === employee.lastName
        );
      }).length,
      employees,
    };
  }

  async confirm(file: UploadedEmployeeFile) {
    this.requireFile(file);
    const employees = await this.parser.parse(file.buffer);
    const stored = await this.files.store(file);
    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const activeImports = await transaction.employeeListImport.findMany({
        where: { status: ImportStatus.ACTIVE },
        select: { id: true },
      });

      if (activeImports.length) {
        await transaction.employeeListImport.updateMany({
          where: { id: { in: activeImports.map((item) => item.id) } },
          data: { status: ImportStatus.ARCHIVED, archivedAt: now },
        });
      }

      return transaction.employeeListImport.create({
        data: {
          fileName: file.originalname,
          ...stored,
          employees: {
            create: employees.map((employee: ParsedEmployee) => employee),
          },
        },
        include: { employees: true },
      });
    });
  }

  async removeActive() {
    const active = await this.prisma.employeeListImport.findFirst({
      where: { status: ImportStatus.ACTIVE },
    });
    if (!active) throw new NotFoundException('Aucune liste active.');

    await this.prisma.employeeListImport.update({
      where: { id: active.id },
      data: { status: ImportStatus.ARCHIVED, archivedAt: new Date() },
    });

    return { deleted: true };
  }

  private requireFile(file: UploadedEmployeeFile | undefined): asserts file is UploadedEmployeeFile {
    if (!file?.buffer) {
      throw new BadRequestException('Aucun fichier Excel recu.');
    }
  }
}
