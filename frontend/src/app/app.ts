import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PayrollCycle } from './core/cycle.models';
import { CycleService } from './core/cycle.service';
import {
  EmployeeImportHistory,
  EmployeeImportPreview,
  EmployeeListImport,
} from './core/employee.models';
import { EmployeeService } from './core/employee.service';
import {
  ExtractedDay,
  ExtractedRow,
  ScanBatch,
  ScanDocument,
  ScanQr,
} from './core/scan.models';
import { ScanService } from './core/scan.service';
import {
  CalculationDayDetail,
  CalculationHistoryItem,
  CalculationHistoryRun,
  CalculationStatus,
  EmployeeCalculation,
} from './core/calculation.models';
import { CalculationService } from './core/calculation.service';
import { Holiday } from './core/holiday.models';
import { HolidayService } from './core/holiday.service';
import { ArchivedDocument } from './core/document.models';
import { DocumentService } from './core/document.service';
import {
  TimeClockReport,
  TimeClockReportEmployee,
} from './core/time-clock.models';
import { TimeClockService } from './core/time-clock.service';

type AppView =
  | 'overview'
  | 'employees'
  | 'time-sheets'
  | 'time-clock'
  | 'holidays'
  | 'calculation-history'
  | 'documents';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly activeView = signal<AppView>('overview');
  protected readonly mobileMenuOpen = signal(false);
  protected readonly cycle = signal<PayrollCycle | null>(null);
  protected readonly cycleError = signal('');
  protected readonly loading = signal(false);
  protected readonly payrollMonth = signal(this.currentMonth());
  protected readonly employeeList = signal<EmployeeListImport | null>(null);
  protected readonly employeeHistory = signal<EmployeeImportHistory[]>([]);
  protected readonly employeePreview = signal<EmployeeImportPreview | null>(null);
  protected readonly employeeFile = signal<File | null>(null);
  protected readonly employeeImportBusy = signal(false);
  protected readonly employeeImportError = signal('');
  protected readonly scanBatch = signal<ScanBatch | null>(null);
  protected readonly scanQr = signal<ScanQr | null>(null);
  protected readonly showQr = signal(false);
  protected readonly scanFiles = signal<File[]>([]);
  protected readonly scanBusy = signal(false);
  protected readonly scanError = signal('');
  protected readonly timeClockReports = signal<TimeClockReport[]>([]);
  protected readonly selectedTimeClockReport = signal<TimeClockReport | null>(
    null,
  );
  protected readonly timeClockBusy = signal(false);
  protected readonly timeClockError = signal('');
  protected readonly timeClockSearch = signal('');
  protected readonly savingTimeClockDay = signal('');
  protected readonly savingPause = signal('');
  protected readonly scanSent = signal(false);
  private readonly maxScanFiles = 12;
  private readonly maxScanFileSize = 12 * 1024 * 1024;
  protected readonly selectedDocument = signal<ScanDocument | null>(null);
  protected readonly retryingDocument = signal('');
  protected readonly deletingDocument = signal('');
  private scanRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private qrRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private qrKnownDocumentIds = new Set<string>();
  protected readonly savingCell = signal('');
  protected readonly extractionError = signal('');
  protected readonly calculationStatus = signal<CalculationStatus | null>(null);
  protected readonly calculationBusy = signal(false);
  protected readonly calculationError = signal('');
  protected readonly selectedCalculation =
    signal<EmployeeCalculation | null>(null);
  protected readonly savingCalculationCell = signal('');
  protected readonly calculationEditError = signal('');
  protected readonly holidays = signal<Holiday[]>([]);
  protected readonly holidayDate = signal('');
  protected readonly holidayLabel = signal('');
  protected readonly holidayBusy = signal(false);
  protected readonly holidayError = signal('');
  protected readonly archivedDocuments = signal<ArchivedDocument[]>([]);
  protected readonly showReset = signal(false);
  protected readonly resetEmployees = signal(false);
  protected readonly resetBusy = signal(false);
  protected readonly resetError = signal('');
  protected readonly exportBusy = signal('');
  protected readonly employeeSearch = signal('');
  protected readonly timeSheetSearch = signal('');
  protected readonly timeSheetFilter =
    signal<'ALL' | 'PROCESSING' | 'CONTROL' | 'VERIFIED' | 'FAILED'>('ALL');
  protected readonly calculationSearch = signal('');
  protected readonly calculationFilter =
    signal<'ALL' | 'REVIEW' | 'CORRECT'>('ALL');
  protected readonly calculationHistory = signal<CalculationHistoryItem[]>([]);
  protected readonly selectedHistoryRun = signal<CalculationHistoryRun | null>(
    null,
  );
  protected readonly historyBusy = signal('');
  protected readonly historyError = signal('');
  protected readonly historySearch = signal('');
  protected readonly historyResultSearch = signal('');
  protected readonly historyResultFilter =
    signal<'ALL' | 'REVIEW' | 'CORRECT'>('ALL');
  protected readonly selectedCalculationHistoryRunId = signal<string | null>(
    null,
  );
  protected readonly archiveSearch = signal('');
  protected readonly archiveType =
    signal<'ALL' | ArchivedDocument['type']>('ALL');
  protected readonly isMobileScan = window.location.pathname.startsWith('/mobile-scan');

  // Pages réservées: visibles uniquement tant que `?admin=1` est dans l'URL.
  protected readonly isAdmin = App.resolveAdmin();

  private readonly allNavigationGroups: {
    label: string;
    items: {
      view: AppView;
      label: string;
      helper: string;
      admin?: boolean;
    }[];
  }[] = [
    {
      label: 'Pilotage',
      items: [
        { view: 'overview', label: 'Vue d’ensemble', helper: 'Période active' },
      ],
    },
    {
      label: 'Préparation mensuelle',
      items: [
        { view: 'employees', label: 'Employés', helper: 'Liste active' },
        {
          view: 'time-sheets',
          label: 'Feuilles horaires',
          helper: 'Feuilles et contrôles',
        },
        {
          view: 'time-clock',
          label: 'Rapports pointeuse',
          helper: 'Heures administration',
        },
        {
          view: 'holidays',
          label: 'Jours fériés',
          helper: 'Calendrier',
          admin: true,
        },
      ],
    },
    {
      label: 'Archives',
      items: [
        {
          view: 'calculation-history',
          label: 'Historique des calculs',
          helper: 'Périodes archivées',
        },
        {
          view: 'documents',
          label: 'Documents',
          helper: 'Fichiers archivés',
          admin: true,
        },
      ],
    },
  ];

  protected readonly navigationGroups = this.allNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => this.isAdmin || !item.admin),
    }))
    .filter((group) => group.items.length);

  protected readonly navigation = this.navigationGroups.flatMap(
    (group) => group.items,
  );

  constructor(
    private readonly cycles: CycleService,
    private readonly employees: EmployeeService,
    private readonly scans: ScanService,
    private readonly calculations: CalculationService,
    private readonly holidayService: HolidayService,
    private readonly documents: DocumentService,
    private readonly timeClock: TimeClockService,
  ) {}

  ngOnInit() {
    if (!this.isMobileScan) {
      this.loadEmployees();
      this.loadCalculationHistory();
      this.loadArchives();
      this.loadCycle(() => {
        this.loadScanBatch();
        this.loadCalculationStatus();
        this.loadHolidays();
        this.loadTimeClockReports();
      });
    }
  }

  protected setView(view: AppView) {
    this.activeView.set(view);
    this.mobileMenuOpen.set(false);
    if (view === 'time-sheets') this.loadScanBatch();
    if (view === 'time-clock') this.loadTimeClockReports();
    if (view === 'holidays') this.loadHolidays();
    if (view === 'calculation-history') this.loadCalculationHistory();
    if (view === 'documents') this.loadArchives();
  }

  protected toggleMobileMenu() {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  protected activeViewLabel() {
    return (
      this.navigation.find((item) => item.view === this.activeView())?.label ??
      ''
    );
  }

  protected changeMonth(month: string) {
    this.payrollMonth.set(month);
    this.closeQr();
    this.scanBatch.set(null);
    this.calculationStatus.set(null);
    this.holidays.set([]);
    this.loadCycle(() => {
      this.loadScanBatch();
      this.loadCalculationStatus();
      this.loadHolidays();
      this.loadTimeClockReports();
      // Le mois ouvert est exclu de l'historique: il doit être rechargé.
      this.loadCalculationHistory();
    });
  }

  protected openQr() {
    this.stopQrWatcher();
    this.showQr.set(true);
    this.scanQr.set(null);
    this.scans.qr().subscribe({
      next: (qr) => this.scanQr.set(qr),
      error: () => this.scanError.set('QR indisponible.'),
    });
    this.scans.latest(this.payrollMonth()).subscribe({
      next: (batch) => {
        this.scanBatch.set(batch);
        this.qrKnownDocumentIds = new Set(
          batch?.documents.map((document) => document.id) ?? [],
        );
        this.watchQrUploads();
      },
      error: () => {
        this.qrKnownDocumentIds = new Set(
          this.scanBatch()?.documents.map((document) => document.id) ?? [],
        );
        this.watchQrUploads();
      },
    });
  }

  protected closeQr() {
    this.showQr.set(false);
    this.stopQrWatcher();
  }

  private watchQrUploads() {
    if (!this.showQr()) return;
    this.scans.latest(this.payrollMonth()).subscribe({
      next: (batch) => {
        const hasNewDocument = batch?.documents.some(
          (document) => !this.qrKnownDocumentIds.has(document.id),
        );
        if (hasNewDocument) {
          this.scanBatch.set(batch);
          this.showQr.set(false);
          this.stopQrWatcher();
          this.setView('time-sheets');
          return;
        }
        this.scheduleQrRefresh();
      },
      error: () => this.scheduleQrRefresh(),
    });
  }

  private scheduleQrRefresh() {
    if (!this.showQr()) return;
    this.qrRefreshTimer = setTimeout(() => this.watchQrUploads(), 3000);
  }

  private stopQrWatcher() {
    if (!this.qrRefreshTimer) return;
    clearTimeout(this.qrRefreshTimer);
    this.qrRefreshTimer = null;
  }

  protected addScanFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const added = Array.from(input.files ?? []);
    input.value = '';
    const supportedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ];
    const supported = added.filter((file) => supportedTypes.includes(file.type));
    const accepted = supported.filter(
      (file) => file.size <= this.maxScanFileSize,
    );
    const selected = [...this.scanFiles(), ...accepted];
    this.scanFiles.set(selected.slice(0, this.maxScanFiles));

    const messages: string[] = [];
    if (supported.length !== added.length) {
      messages.push('Certains formats ne sont pas acceptés.');
    }
    if (accepted.length !== supported.length) {
      messages.push('Chaque document doit faire au maximum 12 Mo.');
    }
    if (selected.length > this.maxScanFiles) {
      messages.push('Maximum 12 documents par envoi.');
    }
    this.scanError.set(messages.join(' '));
  }

  protected removeScanFile(index: number) {
    this.scanFiles.update((files) => files.filter((_, position) => position !== index));
  }

  protected sendScans() {
    if (!this.scanFiles().length) return;
    this.scanBusy.set(true);
    this.scanError.set('');
    this.scans.upload(this.scanFiles()).subscribe({
      next: (batch) => {
        this.scanBatch.set(batch);
        this.scanBusy.set(false);
        this.scanFiles.set([]);
        this.scanSent.set(true);
        this.loadCalculationStatus();
      },
      error: (error) => {
        this.scanError.set(
          error.status === 413
            ? 'Envoi trop volumineux. Chaque document doit faire au maximum 12 Mo.'
            : (error.error?.message ?? 'Envoi impossible.'),
        );
        this.scanBusy.set(false);
      },
    });
  }

  protected sendAnotherScanBatch() {
    this.scanSent.set(false);
    this.scanError.set('');
  }

  protected extractedRowCount() {
    return (
      this.scanBatch()?.documents.reduce(
        (total, document) => total + document.extractedRows.length,
        0,
      ) ?? 0
    );
  }

  protected openExtraction(document: ScanDocument) {
    this.selectedDocument.set(document);
    this.extractionError.set('');
  }

  protected documentNeedsReview(document: ScanDocument) {
    return document.extractedRows.some((row) => row.requiresReview);
  }

  protected documentExtractionFailed(document: ScanDocument) {
    return document.status === 'FAILED';
  }

  protected documentIsProcessing(document: ScanDocument) {
    return document.status === 'PENDING' || document.status === 'PROCESSING';
  }

  protected documentIsVerified(document: ScanDocument) {
    return (
      document.status === 'EXTRACTED' &&
      document.extractedRows.length > 0 &&
      !this.documentNeedsReview(document)
    );
  }

  protected filteredTimeSheets() {
    const search = this.searchValue(this.timeSheetSearch());
    return (this.scanBatch()?.documents ?? []).filter((document) => {
      const matchesSearch =
        !search || this.searchValue(document.fileName).includes(search);
      const filter = this.timeSheetFilter();
      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'PROCESSING' && this.documentIsProcessing(document)) ||
        (filter === 'CONTROL' && this.documentNeedsReview(document)) ||
        (filter === 'VERIFIED' && this.documentIsVerified(document)) ||
        (filter === 'FAILED' && this.documentExtractionFailed(document));
      return matchesSearch && matchesFilter;
    });
  }

  protected retryDocument(document: ScanDocument) {
    if (!this.documentExtractionFailed(document) || this.retryingDocument()) {
      return;
    }
    this.retryingDocument.set(document.id);
    this.scanError.set('');
    this.scans.retryDocument(document.id).subscribe({
      next: (updated) => {
        this.scanBatch.update((batch) =>
          batch
            ? {
                ...batch,
                status: 'PROCESSING',
                documents: batch.documents.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }
            : batch,
        );
        this.retryingDocument.set('');
        this.loadScanBatch();
      },
      error: (error) => {
        this.scanError.set(
          error.error?.message ?? 'La relance de cette feuille a échoué.',
        );
        this.retryingDocument.set('');
      },
    });
  }

  protected deleteDocument(document: ScanDocument) {
    if (this.deletingDocument()) return;
    if (
      !window.confirm(
        `Supprimer la feuille ${document.fileName} et les lignes qui en proviennent ?`,
      )
    ) {
      return;
    }
    this.deletingDocument.set(document.id);
    this.scanError.set('');
    this.scans.deleteDocument(document.id).subscribe({
      next: () => {
        this.deletingDocument.set('');
        if (this.selectedDocument()?.id === document.id) {
          this.closeExtraction();
        }
        this.loadScanBatch();
      },
      error: (error) => {
        this.scanError.set(
          error.error?.message ?? 'Suppression de la feuille impossible.',
        );
        this.deletingDocument.set('');
      },
    });
  }

  protected closeExtraction() {
    this.selectedDocument.set(null);
    this.extractionError.set('');
  }

  protected dayLabel(date: string) {
    return new Intl.DateTimeFormat('fr-DZ', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
  }

  protected confidenceLabel(day: ExtractedDay) {
    if (!day.needsReview) return 'Case validée';
    return day.confidence === 0.6
      ? 'Lecture à contrôler'
      : 'Lecture très incertaine';
  }

  protected saveExtractedDay(
    row: ExtractedRow,
    day: ExtractedDay,
    input: HTMLInputElement,
  ) {
    const value = input.value;
    if (
      value.trim().toUpperCase() === day.value.trim().toUpperCase() &&
      !day.needsReview
    ) {
      return;
    }
    const key = `${row.id}:${day.date}`;
    this.savingCell.set(key);
    this.extractionError.set('');
    this.scans.updateDay(row.id, day.date, value).subscribe({
      next: (updatedRow) => {
        this.replaceExtractedRow(updatedRow);
        this.savingCell.set('');
        this.loadCalculationStatus();
      },
      error: (error) => {
        input.value = day.value;
        this.extractionError.set(
          error.error?.message ?? 'Modification impossible.',
        );
        this.savingCell.set('');
      },
    });
  }

  private replaceExtractedRow(updatedRow: ExtractedRow) {
    const replaceInDocument = (document: ScanDocument) => ({
      ...document,
      extractedRows: document.extractedRows.map((row) =>
        row.id === updatedRow.id ? updatedRow : row,
      ),
    });
    this.scanBatch.update((batch) =>
      batch
        ? {
            ...batch,
            documents: batch.documents.map(replaceInDocument),
          }
        : batch,
    );
    this.selectedDocument.update((document) =>
      document ? replaceInDocument(document) : document,
    );
  }

  protected selectEmployeeFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.employeeFile.set(file);
    this.employeePreview.set(null);
    this.employeeImportError.set('');
    this.employeeImportBusy.set(true);
    this.employees.preview(file).subscribe({
      next: (preview) => {
        this.employeePreview.set(preview);
        this.employeeImportBusy.set(false);
      },
      error: (error) => {
        this.employeeFile.set(null);
        this.employeeImportError.set(
          error.error?.message ?? 'Le fichier ne peut pas etre analyse.',
        );
        this.employeeImportBusy.set(false);
      },
    });
  }

  protected confirmEmployeeImport() {
    const file = this.employeeFile();
    if (!file) return;

    this.employeeImportBusy.set(true);
    this.employeeImportError.set('');
    this.employees.confirm(file).subscribe({
      next: (employeeList) => {
        this.employeeList.set(employeeList);
        this.cancelEmployeePreview();
        this.loadEmployeeHistory();
      },
      error: (error) => {
        this.employeeImportError.set(
          error.error?.message ?? 'Import impossible.',
        );
        this.employeeImportBusy.set(false);
      },
    });
  }

  protected cancelEmployeePreview() {
    this.employeeFile.set(null);
    this.employeePreview.set(null);
    this.employeeImportBusy.set(false);
  }

  protected removeEmployeeList() {
    if (!window.confirm('Supprimer la liste active des employes ?')) return;
    this.employeeImportBusy.set(true);
    this.employees.removeActive().subscribe({
      next: () => {
        this.employeeList.set(null);
        this.employeeImportBusy.set(false);
        this.loadEmployeeHistory();
      },
      error: () => {
        this.employeeImportError.set('Suppression impossible.');
        this.employeeImportBusy.set(false);
      },
    });
  }

  protected formatDate(value: string) {
    return new Intl.DateTimeFormat('fr-DZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected filteredEmployees<
    T extends { matricule: string; firstName: string; lastName: string },
  >(employees: T[]): T[] {
    const search = this.searchValue(this.employeeSearch());
    if (!search) return employees;
    return employees.filter((employee) =>
      this.searchValue(
        `${employee.matricule} ${employee.firstName} ${employee.lastName}`,
      ).includes(search),
    );
  }

  protected selectTimeClockFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.timeClockBusy.set(true);
    this.timeClockError.set('');
    this.timeClock.import(files, this.payrollMonth()).subscribe({
      next: (reports) => {
        this.timeClockReports.set(reports);
        this.timeClockBusy.set(false);
        this.loadCalculationStatus();
        this.loadArchives();
      },
      error: (error) => {
        this.timeClockError.set(
          error.error?.message ?? 'Import des rapports impossible.',
        );
        this.timeClockBusy.set(false);
      },
    });
  }

  protected filteredTimeClockReports() {
    const search = this.searchValue(this.timeClockSearch());
    if (!search) return this.timeClockReports();
    return this.timeClockReports().filter((report) =>
      this.searchValue(
        `${report.fileName} ${report.employees
          .map((entry) => entry.sourceFullName)
          .join(' ')}`,
      ).includes(search),
    );
  }

  protected openTimeClockReport(report: TimeClockReport) {
    this.selectedTimeClockReport.set(report);
  }

  protected timeClockReportNeedsReview(report: TimeClockReport) {
    return report.employees.some((entry) => entry.requiresReview);
  }

  protected timeClockEmployeeName(entry: TimeClockReportEmployee) {
    if (!entry.employee) return entry.sourceFullName;
    return `${entry.employee.firstName} ${entry.employee.lastName}`.trim();
  }

  // Un rapport contient normalement un seul employé, mais la liste reste
  // tolérante si la RH importe un fichier groupé.
  protected timeClockReportEmployeeLabel(report: TimeClockReport) {
    const names = report.employees.map((entry) =>
      this.timeClockEmployeeName(entry),
    );
    if (!names.length) return 'Aucun employé';
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  }

  protected savePause(report: TimeClockReport, pauseMinutes: string) {
    const minutes = Number(pauseMinutes);
    if (minutes === report.pauseMinutes) return;
    this.savingPause.set(report.id);
    this.timeClockError.set('');
    this.timeClock.updatePause(report.id, minutes).subscribe({
      next: (updated) => {
        this.savingPause.set('');
        const applyPause = (item: TimeClockReport) =>
          item.id === updated.id
            ? { ...item, pauseMinutes: updated.pauseMinutes }
            : item;
        this.timeClockReports.update((reports) => reports.map(applyPause));
        this.selectedTimeClockReport.update((item) =>
          item ? applyPause(item) : item,
        );
        this.loadCalculationStatus();
      },
      error: (error) => {
        this.savingPause.set('');
        this.timeClockError.set(
          error.error?.message ?? 'Modification de la pause impossible.',
        );
        this.loadTimeClockReports();
      },
    });
  }

  protected timeClockReportTotalMinutes(report: TimeClockReport) {
    return report.employees.reduce(
      (total, entry) =>
        total +
        entry.days.reduce((dayTotal, day) => dayTotal + day.durationMinutes, 0),
      0,
    );
  }

  protected timeClockStateLabel(state: string) {
    if (state === 'ABSENT') return 'Absent';
    if (state === 'WEEKEND') return 'Week-end';
    if (state === 'WORKED') return 'Pointé';
    return 'Sans pointage';
  }

  protected minutesInput(minutes: number) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
      minutes % 60,
    ).padStart(2, '0')}`;
  }

  protected saveTimeClockDay(
    entryId: string,
    date: string,
    currentMinutes: number,
    input: HTMLInputElement,
  ) {
    const match = input.value.match(/^(\d{1,2}):(\d{2})$/);
    if (
      !match ||
      Number(match[1]) > 23 ||
      Number(match[2]) > 59
    ) {
      input.value = this.minutesInput(currentMinutes);
      return;
    }
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    if (minutes === currentMinutes) return;
    const key = `${entryId}:${date}`;
    this.savingTimeClockDay.set(key);
    this.timeClock.updateDay(entryId, date, minutes).subscribe({
      next: (updatedEntry) => {
        this.savingTimeClockDay.set('');
        const replaceEntry = (report: TimeClockReport) => ({
          ...report,
          employees: report.employees.map((entry) =>
            entry.id === updatedEntry.id ? updatedEntry : entry,
          ),
        });
        this.timeClockReports.update((reports) => reports.map(replaceEntry));
        this.selectedTimeClockReport.update((report) =>
          report ? replaceEntry(report) : report,
        );
        this.loadCalculationStatus();
      },
      error: () => {
        input.value = this.minutesInput(currentMinutes);
        this.timeClockError.set('Modification de la durée impossible.');
        this.savingTimeClockDay.set('');
      },
    });
  }

  protected loadCycle(afterLoad?: () => void) {
    this.loading.set(true);
    this.cycleError.set('');
    this.cycles.getActive(this.payrollMonth()).subscribe({
      next: (cycle) => {
        this.cycle.set(cycle);
        this.loading.set(false);
        afterLoad?.();
      },
      error: () => {
        this.cycleError.set('Le service est temporairement indisponible.');
        this.loading.set(false);
      },
    });
  }

  private loadEmployees() {
    this.employees.active().subscribe({
      next: (employeeList) => this.employeeList.set(employeeList),
      error: () => this.employeeImportError.set('Liste des employes indisponible.'),
    });
    this.loadEmployeeHistory();
  }

  private loadEmployeeHistory() {
    this.employees.history().subscribe({
      next: (history) => this.employeeHistory.set(history),
    });
  }

  private loadTimeClockReports() {
    this.timeClock.list(this.payrollMonth()).subscribe({
      next: (reports) => this.timeClockReports.set(reports),
      error: () =>
        this.timeClockError.set('Rapports pointeuse indisponibles.'),
    });
  }

  private loadScanBatch() {
    if (this.scanRefreshTimer) {
      clearTimeout(this.scanRefreshTimer);
      this.scanRefreshTimer = null;
    }
    this.scans.latest(this.payrollMonth()).subscribe({
      next: (batch) => {
        this.scanBatch.set(batch);
        this.scanError.set('');
        const processing = batch?.documents.some((document) =>
          ['PENDING', 'PROCESSING'].includes(document.status),
        );
        if (processing) {
          this.scanRefreshTimer = setTimeout(() => this.loadScanBatch(), 3000);
        } else {
          this.loadCalculationStatus();
        }
      },
      error: () => {
        this.scanError.set(
          'Actualisation temporairement indisponible. Les feuilles enregistrées sont conservées.',
        );
      },
    });
  }

  protected minutesLabel(minutes: number | null) {
    if (minutes === null) return 'Non calculé';
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  }

  protected isNonWorkingDay(date: string) {
    return this.isWeekendDate(date) || this.holidayForDate(date) !== undefined;
  }

  protected nonWorkingDayLabel(date: string) {
    const holiday = this.holidayForDate(date);
    if (holiday) return `Jour férié : ${holiday.label}`;
    return this.isWeekendDate(date) ? 'Week-end' : '';
  }

  private holidayForDate(date: string) {
    return this.holidays().find((holiday) => holiday.date.slice(0, 10) === date);
  }

  private isWeekendDate(date: string) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return weekday === 5 || weekday === 6;
  }

  protected launchCalculation() {
    if (this.calculationBusy()) return;
    this.calculationBusy.set(true);
    this.calculationError.set('');
    this.calculations.launch(this.payrollMonth()).subscribe({
      next: (status) => {
        this.calculationStatus.set(status);
        this.calculationBusy.set(false);
      },
      error: (error) => {
        this.calculationError.set(
          error.error?.message ?? 'Calcul impossible.',
        );
        this.calculationBusy.set(false);
      },
    });
  }

  protected exportAllCalculations() {
    if (!this.calculationStatus()?.run) return;
    this.exportBusy.set('global');
    this.calculationError.set('');
    this.calculations.exportAll(this.payrollMonth()).subscribe({
      next: (file) => {
        this.downloadFile(
          file,
          `BHM_heures_${this.payrollMonth()}_global.xlsx`,
        );
        this.exportBusy.set('');
      },
      error: (error) => {
        this.calculationError.set(
          error.error?.message ?? 'Export impossible.',
        );
        this.exportBusy.set('');
      },
    });
  }

  protected exportEmployeeCalculation(result: EmployeeCalculation) {
    this.exportBusy.set(result.employee.id);
    this.calculationEditError.set('');
    const historyRunId = this.selectedCalculationHistoryRunId();
    const request = historyRunId
      ? this.calculations.exportHistory(historyRunId, result.employee.id)
      : this.calculations.exportEmployee(
          this.payrollMonth(),
          result.employee.id,
        );
    request.subscribe({
        next: (file) => {
          const payrollMonth = historyRunId
            ? (this.selectedHistoryRun()?.cycle.payrollMonth ??
              this.payrollMonth())
            : this.payrollMonth();
          this.downloadFile(
            file,
            `BHM_heures_${payrollMonth}_${result.employee.matricule}.xlsx`,
          );
          this.exportBusy.set('');
        },
        error: () => {
          this.calculationEditError.set('Export individuel impossible.');
          this.exportBusy.set('');
        },
      });
  }

  protected openReset() {
    this.resetEmployees.set(false);
    this.resetError.set('');
    this.showReset.set(true);
  }

  protected closeReset() {
    if (this.resetBusy()) return;
    this.showReset.set(false);
    this.resetError.set('');
  }

  protected confirmReset() {
    this.resetBusy.set(true);
    this.resetError.set('');
    this.cycles
      .reset(this.payrollMonth(), this.resetEmployees())
      .subscribe({
        next: ({ cycle, resetEmployees }) => {
          this.cycle.set(cycle);
          this.scanBatch.set(null);
          this.timeClockReports.set([]);
          this.calculationStatus.set(null);
          this.selectedDocument.set(null);
          this.selectedCalculation.set(null);
          if (resetEmployees) this.employeeList.set(null);
          this.showReset.set(false);
          this.resetBusy.set(false);
          this.loadEmployees();
          this.loadScanBatch();
          this.loadCalculationStatus();
          this.loadTimeClockReports();
          this.loadCalculationHistory();
          this.loadHolidays();
          this.loadArchives();
        },
        error: (error) => {
          this.resetError.set(
            error.error?.message ?? 'Réinitialisation impossible.',
          );
          this.resetBusy.set(false);
        },
      });
  }

  protected openCalculation(result: EmployeeCalculation) {
    this.selectedCalculationHistoryRunId.set(null);
    this.selectedCalculation.set(result);
    this.calculationEditError.set('');
  }

  protected openHistoryRun(item: CalculationHistoryItem) {
    this.historyBusy.set(item.id);
    this.historyError.set('');
    this.calculations.historyRun(item.id).subscribe({
      next: (run) => {
        this.selectedHistoryRun.set(run);
        this.historyResultSearch.set('');
        this.historyResultFilter.set('ALL');
        this.historyBusy.set('');
      },
      error: () => {
        this.historyError.set('Le calcul archivé est indisponible.');
        this.historyBusy.set('');
      },
    });
  }

  protected closeHistoryRun() {
    this.selectedHistoryRun.set(null);
  }

  protected openHistoryCalculation(
    run: CalculationHistoryRun,
    result: EmployeeCalculation,
  ) {
    this.selectedCalculationHistoryRunId.set(run.id);
    this.selectedCalculation.set(result);
    this.calculationEditError.set('');
  }

  protected filteredCalculationHistory() {
    const search = this.searchValue(this.historySearch());
    return this.calculationHistory().filter((item) => {
      if (!search) return true;
      return this.searchValue(
        `${item.cycle.payrollMonth} ${this.periodLabel(item.cycle)}`,
      ).includes(search);
    });
  }

  protected filteredHistoryResults(results: EmployeeCalculation[]) {
    const search = this.searchValue(this.historyResultSearch());
    return results.filter((result) => {
      const matchesSearch =
        !search ||
        this.searchValue(
          `${result.employee.matricule} ${result.employee.firstName} ${result.employee.lastName}`,
        ).includes(search);
      const filter = this.historyResultFilter();
      return (
        matchesSearch &&
        (filter === 'ALL' ||
          (filter === 'REVIEW' && result.requiresReview) ||
          (filter === 'CORRECT' && !result.requiresReview))
      );
    });
  }

  protected historyReviewCount(results: EmployeeCalculation[]) {
    return results.filter((result) => result.requiresReview).length;
  }

  protected exportHistoryRun(run: CalculationHistoryRun) {
    this.historyBusy.set(`export:${run.id}`);
    this.historyError.set('');
    this.calculations.exportHistory(run.id).subscribe({
      next: (file) => {
        this.downloadFile(
          file,
          `BHM_heures_${run.cycle.payrollMonth}_global.xlsx`,
        );
        this.historyBusy.set('');
      },
      error: () => {
        this.historyError.set('Export historique impossible.');
        this.historyBusy.set('');
      },
    });
  }

  protected filteredCalculations(results: EmployeeCalculation[]) {
    const search = this.searchValue(this.calculationSearch());
    return results.filter((result) => {
      const matchesSearch =
        !search ||
        this.searchValue(
          `${result.employee.matricule} ${result.employee.firstName} ${result.employee.lastName}`,
        ).includes(search);
      const filter = this.calculationFilter();
      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'REVIEW' && result.requiresReview) ||
        (filter === 'CORRECT' && !result.requiresReview);
      return matchesSearch && matchesFilter;
    });
  }

  protected saveCalculationSource(
    result: EmployeeCalculation,
    day: CalculationDayDetail,
    source: CalculationDayDetail['sources'][number],
    input: HTMLInputElement,
  ) {
    const currentValue = this.calculationSourceValue(day, source);
    if (
      input.value.trim().toUpperCase() === currentValue.trim().toUpperCase() &&
      !(source.needsReview ?? day.requiresReview)
    ) {
      return;
    }

    const key = `${source.rowId}:${day.date}`;
    this.savingCalculationCell.set(key);
    this.calculationEditError.set('');
    this.scans.updateDay(source.rowId, day.date, input.value).subscribe({
      next: (updatedRow) => {
        this.replaceExtractedRow(updatedRow);
        this.calculations.status(this.payrollMonth()).subscribe({
          next: (status) => {
            this.calculationStatus.set(status);
            const updatedResult = status.run?.results.find(
              (candidate) => candidate.employee.id === result.employee.id,
            );
            this.selectedCalculation.set(updatedResult ?? null);
            this.savingCalculationCell.set('');
          },
          error: () => {
            this.calculationEditError.set(
              'Valeur enregistrée, mais le résultat actualisé est indisponible.',
            );
            this.savingCalculationCell.set('');
          },
        });
      },
      error: (error) => {
        input.value = currentValue;
        this.calculationEditError.set(
          error.error?.message ?? 'Modification impossible.',
        );
        this.savingCalculationCell.set('');
      },
    });
  }

  protected calculationSourceValue(
    day: CalculationDayDetail,
    source: CalculationDayDetail['sources'][number],
  ) {
    if (source.value !== undefined) return source.value;
    const sourceIndex = day.sources.indexOf(source);
    return day.values[sourceIndex] ?? '';
  }

  protected specificCalculationWarnings(result: EmployeeCalculation) {
    return result.warnings.filter(
      (warning) =>
        warning !== 'La feuille contient au moins une case à vérifier',
    );
  }

  protected reviewDayCount(result: EmployeeCalculation) {
    return result.details.filter((day) => day.requiresReview).length;
  }

  protected calculationDayTypeLabel(
    dayType: 'WORKDAY' | 'WEEKEND' | 'HOLIDAY',
  ) {
    return dayType === 'HOLIDAY'
      ? 'Férié'
      : dayType === 'WEEKEND'
        ? 'Week-end'
        : 'Ouvrable';
  }

  protected closeCalculation() {
    this.selectedCalculation.set(null);
    this.selectedCalculationHistoryRunId.set(null);
    this.calculationEditError.set('');
  }

  protected selectedCalculationAdjustment() {
    if (this.selectedCalculationHistoryRunId()) {
      return this.selectedHistoryRun()?.adjustmentMinutes ?? 0;
    }
    return this.calculationStatus()?.run?.adjustmentMinutes ?? 0;
  }

  protected adjustmentLabel(minutes: number) {
    const sign = minutes > 0 ? '+' : '';
    return `${sign}${this.minutesLabel(minutes)}`;
  }

  protected createHoliday() {
    if (!this.holidayDate() || !this.holidayLabel().trim()) return;
    this.holidayBusy.set(true);
    this.holidayError.set('');
    this.holidayService
      .create(this.holidayDate(), this.holidayLabel(), this.payrollMonth())
      .subscribe({
        next: () => {
          this.holidayDate.set('');
          this.holidayLabel.set('');
          this.holidayBusy.set(false);
          this.loadHolidays();
          this.loadCalculationStatus();
        },
        error: (error) => {
          this.holidayError.set(
            error.error?.message ?? 'Enregistrement impossible.',
          );
          this.holidayBusy.set(false);
        },
      });
  }

  protected removeHoliday(id: string) {
    this.holidayBusy.set(true);
    this.holidayService.remove(id, this.payrollMonth()).subscribe({
      next: () => {
        this.holidayBusy.set(false);
        this.loadHolidays();
        this.loadCalculationStatus();
      },
      error: () => {
        this.holidayError.set('Suppression impossible.');
        this.holidayBusy.set(false);
      },
    });
  }

  private loadCalculationStatus() {
    this.calculations.status(this.payrollMonth()).subscribe({
      next: (status) => this.calculationStatus.set(status),
      error: () => this.calculationStatus.set(null),
    });
  }

  private loadCalculationHistory() {
    this.calculations.history(this.payrollMonth()).subscribe({
      next: (history) => this.calculationHistory.set(history),
      error: () => this.historyError.set('Historique indisponible.'),
    });
  }

  private loadHolidays() {
    this.holidayService.list(this.payrollMonth()).subscribe({
      next: (holidays) => this.holidays.set(holidays),
      error: () => this.holidayError.set('Calendrier indisponible.'),
    });
  }

  private loadArchives() {
    this.documents.archive().subscribe({
      next: (documents) => this.archivedDocuments.set(documents),
    });
  }

  protected archiveTypeLabel(type: ArchivedDocument['type']) {
    if (type === 'EMPLOYEE_LIST') return 'Liste employés';
    if (type === 'TIME_CLOCK') return 'Rapport pointeuse';
    return 'Feuille horaire';
  }

  protected filteredArchives() {
    const search = this.searchValue(this.archiveSearch());
    return this.archivedDocuments().filter((item) => {
      const matchesSearch =
        !search ||
        this.searchValue(
          `${item.fileName} ${item.detail} ${item.payrollMonth ?? ''}`,
        ).includes(search);
      return (
        matchesSearch &&
        (this.archiveType() === 'ALL' || item.type === this.archiveType())
      );
    });
  }

  private searchValue(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private downloadFile(file: Blob, fileName: string) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected cycleLabel() {
    const cycle = this.cycle();
    if (!cycle) return 'Chargement de la période';
    const formatter = new Intl.DateTimeFormat('fr-DZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `Du ${formatter.format(new Date(cycle.startDate))} au ${formatter.format(new Date(cycle.endDate))}`;
  }

  protected periodLabel(cycle: { startDate: string; endDate: string }) {
    const formatter = new Intl.DateTimeFormat('fr-DZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `Du ${formatter.format(new Date(cycle.startDate))} au ${formatter.format(new Date(cycle.endDate))}`;
  }

  private static resolveAdmin() {
    return new URLSearchParams(window.location.search).get('admin') === '1';
  }

  private currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
