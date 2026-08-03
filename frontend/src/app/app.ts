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

type AppView =
  | 'overview'
  | 'employees'
  | 'time-sheets'
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
  protected readonly scanSent = signal(false);
  protected readonly selectedDocument = signal<ScanDocument | null>(null);
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
    signal<'ALL' | 'CONTROL' | 'VERIFIED' | 'FAILED'>('ALL');
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

  protected readonly navigationGroups: {
    label: string;
    items: { view: AppView; label: string; helper: string }[];
  }[] = [
    {
      label: 'Pilotage',
      items: [
        { view: 'overview', label: 'Vue d’ensemble', helper: 'Cycle actif' },
      ],
    },
    {
      label: 'Préparation mensuelle',
      items: [
        { view: 'employees', label: 'Employés', helper: 'Liste active' },
        {
          view: 'time-sheets',
          label: 'Feuilles horaires',
          helper: 'Scans et contrôles',
        },
        { view: 'holidays', label: 'Jours fériés', helper: 'Calendrier' },
      ],
    },
    {
      label: 'Archives',
      items: [
        {
          view: 'calculation-history',
          label: 'Historique des calculs',
          helper: 'Cycles archivés',
        },
        { view: 'documents', label: 'Documents', helper: 'Fichiers archivés' },
      ],
    },
  ];
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
  ) {}

  ngOnInit() {
    if (!this.isMobileScan) {
      this.loadCycle();
      this.loadEmployees();
      this.loadScanBatch();
      this.loadCalculationStatus();
      this.loadCalculationHistory();
      this.loadHolidays();
      this.loadArchives();
    }
  }

  protected setView(view: AppView) {
    this.activeView.set(view);
    this.mobileMenuOpen.set(false);
    if (view === 'time-sheets') this.loadScanBatch();
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
    this.loadCycle();
    this.loadScanBatch();
    this.loadCalculationStatus();
    this.loadHolidays();
  }

  protected openQr() {
    this.showQr.set(true);
    this.scanQr.set(null);
    this.scans.qr().subscribe({
      next: (qr) => this.scanQr.set(qr),
      error: () => this.scanError.set('QR indisponible.'),
    });
  }

  protected closeQr() {
    this.showQr.set(false);
  }

  protected addScanFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const added = Array.from(input.files ?? []);
    input.value = '';
    const supported = added.filter((file) =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(
        file.type,
      ),
    );
    this.scanFiles.set([...this.scanFiles(), ...supported].slice(0, 12));
    this.scanError.set(
      supported.length === added.length ? '' : 'Certains formats ne sont pas acceptés.',
    );
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
        if (batch.status === 'EXTRACTED') {
          this.scanSent.set(true);
        } else {
          this.scanError.set(
            batch.errorMessage ??
              'Les documents sont enregistrés, mais l’extraction doit être vérifiée.',
          );
        }
        this.loadCalculationStatus();
      },
      error: (error) => {
        this.scanError.set(error.error?.message ?? 'Envoi impossible.');
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
        (filter === 'CONTROL' && this.documentNeedsReview(document)) ||
        (filter === 'VERIFIED' && this.documentIsVerified(document)) ||
        (filter === 'FAILED' && this.documentExtractionFailed(document));
      return matchesSearch && matchesFilter;
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
    return `Confiance ${Math.round(day.confidence * 100)} %`;
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

  protected loadCycle() {
    this.loading.set(true);
    this.cycleError.set('');
    this.cycles.getActive(this.payrollMonth()).subscribe({
      next: (cycle) => {
        this.cycle.set(cycle);
        this.loading.set(false);
      },
      error: () => {
        this.cycleError.set('Le backend est indisponible.');
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

  private loadScanBatch() {
    this.scans.latest(this.payrollMonth()).subscribe({
      next: (batch) => this.scanBatch.set(batch),
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
    if (!this.calculationStatus()?.canLaunch) return;
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
          this.calculationStatus.set(null);
          this.selectedDocument.set(null);
          this.selectedCalculation.set(null);
          if (resetEmployees) this.employeeList.set(null);
          this.showReset.set(false);
          this.resetBusy.set(false);
          this.loadEmployees();
          this.loadScanBatch();
          this.loadCalculationStatus();
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
    this.calculations.history().subscribe({
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

  private currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
