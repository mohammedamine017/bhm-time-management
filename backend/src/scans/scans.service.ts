import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
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
export class ScansService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScansService.name);
  private readonly documentQueue: string[] = [];
  private readonly queuedDocuments = new Set<string>();
  private workerRunning = false;
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

  onApplicationBootstrap() {
    setTimeout(() => void this.resumePendingDocuments(), 0);
  }

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

    const documents = batches.flatMap((batch) => batch.documents);
    const status = documents.some(
      (document) =>
        document.status === ScanDocumentStatus.PENDING ||
        document.status === ScanDocumentStatus.PROCESSING,
    )
      ? ScanBatchStatus.PROCESSING
      : documents.some((document) => document.status === ScanDocumentStatus.FAILED)
        ? ScanBatchStatus.FAILED
        : ScanBatchStatus.EXTRACTED;

    return {
      ...batches[0],
      status,
      batchCount: batches.length,
      documents,
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
    const documentIds: string[] = [];

    for (const file of files) {
      const stored = await this.storage.store(file);
      const document = await this.prisma.scanDocument.create({
        data: {
          batchId: batch.id,
          fileName: file.originalname,
          mimeType: file.mimetype,
          ...stored,
          status: ScanDocumentStatus.PENDING,
        },
      });
      documentIds.push(document.id);
    }

    const result = await this.latest(cycle.payrollMonth);
    if (!result) throw new NotFoundException('Lot introuvable.');
    this.enqueueDocuments(documentIds);
    return result;
  }

  async retryDocument(documentId: string) {
    const document = await this.prisma.scanDocument.findUnique({
      where: { id: documentId },
      include: { extractedRows: true },
    });
    if (!document) throw new NotFoundException('Feuille introuvable.');
    if (document.status !== ScanDocumentStatus.FAILED) {
      throw new BadRequestException(
        'Seule une extraction echouee peut etre relancee.',
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.extractedTimeSheetRow.deleteMany({
        where: { documentId },
      }),
      this.prisma.scanDocument.update({
        where: { id: documentId },
        data: {
          status: ScanDocumentStatus.PENDING,
          errorMessage: null,
          extractedAt: null,
        },
        include: { extractedRows: true },
      }),
      this.prisma.scanBatch.update({
        where: { id: document.batchId },
        data: {
          status: ScanBatchStatus.PROCESSING,
          errorMessage: null,
          extractedAt: null,
        },
      }),
    ]);
    this.enqueueDocuments([documentId]);
    return updated;
  }

  private async resumePendingDocuments() {
    try {
      await this.prisma.scanDocument.updateMany({
        where: { status: ScanDocumentStatus.PROCESSING },
        data: { status: ScanDocumentStatus.PENDING },
      });
      const documents = await this.prisma.scanDocument.findMany({
        where: { status: ScanDocumentStatus.PENDING },
        select: { id: true },
        orderBy: { uploadedAt: 'asc' },
      });
      this.enqueueDocuments(documents.map((document) => document.id));
    } catch (error) {
      this.logger.error(
        `Reprise des extractions impossible: ${this.errorMessage(error)}`,
      );
    }
  }

  private enqueueDocuments(documentIds: string[]) {
    for (const documentId of documentIds) {
      if (this.queuedDocuments.has(documentId)) continue;
      this.queuedDocuments.add(documentId);
      this.documentQueue.push(documentId);
    }
    if (!this.workerRunning && this.documentQueue.length) {
      setTimeout(() => void this.runWorker(), 0);
    }
  }

  private async runWorker() {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      while (this.documentQueue.length) {
        const documentId = this.documentQueue.shift();
        if (!documentId) continue;
        try {
          await this.processDocument(documentId);
        } catch (error) {
          this.logger.error(
            `Traitement ${documentId} interrompu: ${this.errorMessage(error)}`,
          );
        } finally {
          this.queuedDocuments.delete(documentId);
        }
      }
    } finally {
      this.workerRunning = false;
      if (this.documentQueue.length) {
        setTimeout(() => void this.runWorker(), 0);
      }
    }
  }

  private async processDocument(documentId: string) {
    const claimed = await this.prisma.scanDocument.updateMany({
      where: { id: documentId, status: ScanDocumentStatus.PENDING },
      data: { status: ScanDocumentStatus.PROCESSING, errorMessage: null },
    });
    if (!claimed.count) return;

    const document = await this.prisma.scanDocument.findUnique({
      where: { id: documentId },
      include: { batch: { include: { cycle: true } } },
    });
    if (!document) return;

    try {
      const employees = await this.prisma.employee.findMany({
        where: { listImport: { status: 'ACTIVE' } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      if (!employees.length) {
        throw new Error('La liste active des employes est requise.');
      }
      const file = await this.storage.read(document);
      const extraction = await this.claude.extract(
        file,
        employees,
        document.batch.cycle.startDate,
        document.batch.cycle.endDate,
      );

      await this.prisma.$transaction([
        this.prisma.extractedTimeSheetRow.deleteMany({
          where: { documentId },
        }),
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
              documentId,
              employeeId,
              extractedFullName: row.extractedFullName,
              matchedFullName: row.matchedFullName,
              sourceRowLabel: row.sourceRowLabel,
              days,
              requiresReview:
                !employeeId || days.some((day) => day.needsReview),
            };
          }),
        }),
        this.prisma.scanDocument.update({
          where: { id: documentId },
          data: {
            status: ScanDocumentStatus.EXTRACTED,
            errorMessage: null,
            extractedAt: new Date(),
          },
        }),
      ]);
    } catch (error) {
      await this.prisma.scanDocument.update({
        where: { id: documentId },
        data: {
          status: ScanDocumentStatus.FAILED,
          errorMessage: this.errorMessage(error),
          extractedAt: null,
        },
      });
    } finally {
      await this.refreshBatch(document.batchId, document.batch.cycleId);
    }
  }

  private async refreshBatch(batchId: string, cycleId: string) {
    const documents = await this.prisma.scanDocument.findMany({
      where: { batchId },
      select: { status: true },
    });
    const processing = documents.some(
      (document) =>
        document.status === ScanDocumentStatus.PENDING ||
        document.status === ScanDocumentStatus.PROCESSING,
    );
    const failed = documents.some(
      (document) => document.status === ScanDocumentStatus.FAILED,
    );
    const status = processing
      ? ScanBatchStatus.PROCESSING
      : failed
        ? ScanBatchStatus.FAILED
        : ScanBatchStatus.EXTRACTED;

    await this.prisma.scanBatch.update({
      where: { id: batchId },
      data: {
        status,
        extractedAt: processing ? null : new Date(),
        errorMessage: failed
          ? 'Un ou plusieurs documents n’ont pas pu etre extraits.'
          : null,
      },
    });
    if (!processing) {
      await this.calculations.recalculateIfExists(cycleId);
    }
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
        'Valeur attendue: heures, heures avec D ou F, A, 0, X, T, F, STC, MU, RC, CP, MA ou vide.',
      );
    }
    return parsed.normalized;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 500);
    return 'Erreur d’extraction inconnue.';
  }
}
