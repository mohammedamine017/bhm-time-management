import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ScanBatchStatus,
  ScanDocumentStatus,
} from '@prisma/client';
import QRCode from 'qrcode';
import { CalculationsService } from '../calculations/calculations.service';
import { parseTimeSheetDayValue } from '../common/time-sheet-day-value';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeExtractionService } from './claude-extraction.service';
import { ScanStorageService } from './scan-storage.service';

interface UploadedScan {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

interface ExtractedDay {
  date: string;
  value: string;
  confidence: number;
  needsReview: boolean;
}

@Injectable()
export class ScansService {
  private readonly supportedTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cycles: CyclesService,
    private readonly storage: ScanStorageService,
    private readonly claude: ClaudeExtractionService,
    private readonly calculations: CalculationsService,
  ) {}

  async qr(mobileUrl: string) {
    return { mobileUrl, dataUrl: await QRCode.toDataURL(mobileUrl, { width: 280, margin: 1 }) };
  }

  async latest(month?: string) {
    const cycle = await this.cycles.getOrCreateActive(month);
    const batches = await this.prisma.scanBatch.findMany({
      where: { cycleId: cycle.id },
      include: {
        documents: {
          include: { extractedRows: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!batches.length) return null;

    return {
      ...batches[0],
      batchCount: batches.length,
      documents: batches.flatMap((batch) => batch.documents),
    };
  }

  async upload(files: UploadedScan[], month?: string) {
    if (!files?.length) throw new BadRequestException('Aucun document recu.');
    if (files.length > 12) throw new BadRequestException('Maximum 12 documents par envoi.');
    if (files.some((file) => !this.supportedTypes.has(file.mimetype))) {
      throw new BadRequestException('Formats acceptes: JPG, PNG, WEBP, GIF et PDF.');
    }

    const cycle = await this.cycles.getOrCreateActive(month);
    const employees = await this.prisma.employee.findMany({
      where: { listImport: { status: 'ACTIVE' } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    if (!employees.length) {
      throw new BadRequestException('La liste active des employes est requise.');
    }

    const batch = await this.prisma.scanBatch.create({
      data: { cycleId: cycle.id },
    });
    let failed = false;

    for (const file of files) {
      const stored = await this.storage.store(file);
      const document = await this.prisma.scanDocument.create({
        data: {
          batchId: batch.id,
          fileName: file.originalname,
          mimeType: file.mimetype,
          ...stored,
          status: ScanDocumentStatus.PROCESSING,
        },
      });

      try {
        const extraction = await this.claude.extract(
          file,
          employees,
          cycle.startDate,
          cycle.endDate,
        );
        await this.prisma.$transaction([
          this.prisma.extractedTimeSheetRow.createMany({
            data: extraction.rows.map((row) => {
              const employeeId = employees.some(
                (employee) => employee.id === row.employeeId,
              )
                ? row.employeeId
                : null;
              const days = row.days.map((day) => {
                const parsedValue = parseTimeSheetDayValue(day.value);
                return {
                  ...day,
                  value: parsedValue.normalized,
                  needsReview:
                    !parsedValue.supported ||
                    (parsedValue.normalized !== '' && day.confidence <= 0.6),
                };
              });

              return {
                documentId: document.id,
                employeeId,
                extractedFullName: row.extractedFullName,
                matchedFullName: row.matchedFullName,
                sourceRowLabel: row.sourceRowLabel,
                days,
                hasTimeClockCode: days.some(
                  (day) => day.value.trim().toUpperCase() === 'T',
                ),
                requiresReview:
                  !employeeId || days.some((day) => day.needsReview),
              };
            }),
          }),
          this.prisma.scanDocument.update({
            where: { id: document.id },
            data: {
              status: ScanDocumentStatus.EXTRACTED,
              extractedAt: new Date(),
            },
          }),
        ]);
      } catch (error) {
        failed = true;
        await this.prisma.scanDocument.update({
          where: { id: document.id },
          data: {
            status: ScanDocumentStatus.FAILED,
            errorMessage: this.errorMessage(error),
          },
        });
      }
    }

    await this.prisma.scanBatch.update({
      where: { id: batch.id },
      data: {
        status: failed ? ScanBatchStatus.FAILED : ScanBatchStatus.EXTRACTED,
        extractedAt: new Date(),
        errorMessage: failed ? 'Un ou plusieurs documents n’ont pas pu etre extraits.' : null,
      },
    });
    await this.calculations.recalculateIfExists(cycle.id);

    const result = await this.latest(cycle.payrollMonth);
    if (!result) throw new NotFoundException('Lot introuvable.');
    return result;
  }

  async updateDay(rowId: string, date: string, value: string) {
    const row = await this.prisma.extractedTimeSheetRow.findUnique({
      where: { id: rowId },
      include: { document: { include: { batch: true } } },
    });
    if (!row) throw new NotFoundException('Ligne extraite introuvable.');

    const days = this.extractedDays(row.days);
    const dayIndex = days.findIndex((day) => day.date === date);
    if (dayIndex === -1) {
      throw new NotFoundException('Case journaliere introuvable.');
    }

    const normalizedValue = this.normalizeDayValue(value);
    days[dayIndex] = {
      ...days[dayIndex],
      value: normalizedValue,
      confidence: 1,
      needsReview: false,
    };

    const updated = await this.prisma.extractedTimeSheetRow.update({
      where: { id: rowId },
      data: {
        days: days as unknown as Prisma.InputJsonValue,
        hasTimeClockCode: days.some(
          (day) => day.value.trim().toUpperCase() === 'T',
        ),
        requiresReview:
          !row.employeeId || days.some((day) => day.needsReview),
      },
    });
    await this.calculations.recalculateIfExists(row.document.batch.cycleId);
    return updated;
  }

  private extractedDays(value: unknown): ExtractedDay[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Grille extraite invalide.');
    }
    return value as ExtractedDay[];
  }

  private normalizeDayValue(value: string) {
    const parsed = parseTimeSheetDayValue(value);
    if (!parsed.supported) {
      throw new BadRequestException(
        'Valeur attendue: heures, heures avec D ou F, P, A, 0, X, T, F, STC, MU, RC, CP, MA ou vide.',
      );
    }
    return parsed.normalized;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 500);
    return 'Erreur d’extraction inconnue.';
  }
}
