import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async archive() {
    const [timeSheets, employeeLists, timeClockReports] = await Promise.all([
      this.prisma.scanDocument.findMany({
        include: { batch: { include: { cycle: true } } },
        orderBy: { uploadedAt: 'desc' },
      }),
      this.prisma.employeeListImport.findMany({
        orderBy: { importedAt: 'desc' },
      }),
      this.prisma.timeClockReport.findMany({
        include: { cycle: true },
        orderBy: { importedAt: 'desc' },
      }),
    ]);

    return [
      ...timeSheets.map((document) => ({
        id: document.id,
        type: 'TIME_SHEET' as const,
        fileName: document.fileName,
        storageUrl: document.storageUrl,
        importedAt: document.uploadedAt,
        payrollMonth: document.batch.cycle.payrollMonth,
        detail: 'Feuille horaire',
      })),
      ...employeeLists.map((list) => ({
        id: list.id,
        type: 'EMPLOYEE_LIST' as const,
        fileName: list.fileName,
        storageUrl: list.storageUrl,
        importedAt: list.importedAt,
        payrollMonth: null,
        detail: 'Liste des employés',
      })),
      ...timeClockReports.map((report) => ({
        id: report.id,
        type: 'TIME_CLOCK' as const,
        fileName: report.fileName,
        storageUrl: report.storageUrl,
        importedAt: report.importedAt,
        payrollMonth: report.cycle.payrollMonth,
        detail: 'Rapport de pointeuse',
      })),
    ].sort(
      (first, second) =>
        second.importedAt.getTime() - first.importedAt.getTime(),
    );
  }
}
