import { CalculationEngineService } from './calculation-engine.service';
import type { ScannedCalculationDay } from './calculation.types';

describe('CalculationEngineService', () => {
  const engine = new CalculationEngineService();
  const scanned = (
    date: string,
    value: string,
    needsReview = false,
  ): ScannedCalculationDay => ({
    date,
    value,
    needsReview,
    rowRequiresReview: needsReview,
    rowId: 'row-1',
    documentId: 'document-1',
    fileName: 'feuille.jpg',
    storageUrl: null,
  });

  it('calcule heures normales, absences et supplements selon le jour', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', '10'),
        scanned('2026-06-23', 'A'),
        scanned('2026-06-24', 'X'),
        scanned('2026-06-25', '0'),
        scanned('2026-06-26', '8'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    // Brut: 1440 d'absence, 120 de mini et 480 de maxi. Les 600 minutes
    // supplémentaires compensent d'autant les heures d'absence.
    expect(result).toMatchObject({
      normalMinutes: 480,
      absenceMinutes: 840,
      overtimeMiniMinutes: 0,
      overtimeMaxiMinutes: 0,
      displacementDays: 0,
    });
  });

  it('compense les heures d’absence par les heures supplémentaires', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', '10'),
        scanned('2026-06-23', 'A'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(480);
    expect(result.absenceMinutes).toBe(360);
    expect(result.overtimeMiniMinutes).toBe(0);
  });

  it('consomme le supplément mini avant le maxi', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-23', 'A'),
        scanned('2026-06-26', '8'),
        scanned('2026-06-27', '8'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.absenceMinutes).toBe(0);
    expect(result.overtimeMiniMinutes).toBe(0);
    expect(result.overtimeMaxiMinutes).toBe(480);
  });

  it('conserve les totaux bruts quand le résultat est à vérifier', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', '10'),
        scanned('2026-06-23', 'A'),
        scanned('2026-06-24', 'P'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.requiresReview).toBe(true);
    expect(result.absenceMinutes).toBe(480);
    expect(result.overtimeMiniMinutes).toBe(120);
  });

  it('additionne les heures atelier et administration pour la même date', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [scanned('2026-06-22', '4')],
      administrationDays: [
        {
          date: '2026-06-22',
          punches: ['08:00:00', '12:00:00'],
          durationMinutes: 240,
          state: 'WORKED',
          stateLabel: '',
          needsReview: false,
          reportId: 'report-1',
          fileName: 'pointage.xls',
          storageUrl: null,
        },
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(480);
    expect(result.overtimeMiniMinutes).toBe(0);
    expect(result.details[0].administrationMinutes).toBe(240);
  });

  it('compte huit heures d’absence pour une journée pointée absente', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [],
      administrationDays: [
        {
          date: '2026-06-22',
          punches: [],
          durationMinutes: 0,
          state: 'ABSENT',
          stateLabel: 'Absent(e)',
          needsReview: false,
          reportId: 'report-1',
          fileName: 'pointage.xls',
          storageUrl: null,
        },
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.absenceMinutes).toBe(480);
    expect(result.normalMinutes).toBe(0);
    expect(result.details[0].absenceDay).toBe(true);
  });

  it('calcule les heures et le deplacement contenus dans une valeur 8D', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', '8D'),
        scanned('2026-06-26', '8D'),
        scanned('2026-07-05', '8D'),
      ],
      holidayDates: new Set(['2026-07-05']),
      adjustmentMinutes: 0,
    });

    expect(result).toMatchObject({
      normalMinutes: 480,
      overtimeMiniMinutes: 0,
      overtimeMaxiMinutes: 960,
      displacementDays: 3,
      requiresReview: false,
    });
  });

  it('refuse D sans heures et ne le compte pas comme deplacement', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [scanned('2026-06-22', 'D')],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.displacementDays).toBe(0);
    expect(result.requiresReview).toBe(true);
    expect(result.warnings).toContain('2026-06-22: valeur non reconnue');
  });

  it('compte T comme une journée de travail à la tâche sans ajouter d’heures', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-07-07', 'T'),
        scanned('2026-07-07', 'T'),
        scanned('2026-07-08', 'T'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(0);
    expect(result.overtimeMiniMinutes).toBe(0);
    expect(result.overtimeMaxiMinutes).toBe(0);
    expect(result.taskDays).toBe(2);
    expect(result.requiresReview).toBe(false);
  });

  it('ne calcule aucune heure pour le code P supprimé', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [scanned('2026-06-22', 'P')],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(0);
    expect(result.requiresReview).toBe(true);
    expect(result.warnings).toContain('2026-06-22: valeur non reconnue');
  });

  it('classe un travail ferie en supplement maxi et conserve la verification', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [scanned('2026-07-05', '8', true)],
      holidayDates: new Set(['2026-07-05']),
      adjustmentMinutes: 480,
    });

    expect(result.normalMinutes).toBe(480);
    expect(result.overtimeMaxiMinutes).toBe(480);
    expect(result.requiresReview).toBe(true);
  });

  it('classe les heures du vendredi en supplement maxi', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [scanned('2026-06-26', '8')],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(0);
    expect(result.overtimeMiniMinutes).toBe(0);
    expect(result.overtimeMaxiMinutes).toBe(480);
  });

  it('conserve les heures du samedi en supplement mini', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [scanned('2026-06-27', '8')],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(0);
    expect(result.overtimeMiniMinutes).toBe(480);
    expect(result.overtimeMaxiMinutes).toBe(0);
  });

  it.each(['8F', 'F8'])(
    'accepte %s comme huit heures travaillees un jour ferie',
    (value) => {
      const result = engine.calculate({
        employeeId: 'employee-1',
        scannedDays: [scanned('2026-07-06', value)],
        holidayDates: new Set(),
        adjustmentMinutes: 0,
      });

      expect(result.normalMinutes).toBe(0);
      expect(result.overtimeMaxiMinutes).toBe(480);
      expect(result.displacementDays).toBe(0);
      expect(result.requiresReview).toBe(false);
    },
  );

  it.each(['8D', 'D8'])(
    'accepte %s comme huit heures travaillees avec deplacement',
    (value) => {
      const result = engine.calculate({
        employeeId: 'employee-1',
        scannedDays: [scanned('2026-07-06', value)],
        holidayDates: new Set(),
        adjustmentMinutes: 0,
      });

      expect(result.normalMinutes).toBe(480);
      expect(result.displacementDays).toBe(1);
      expect(result.requiresReview).toBe(false);
    },
  );

  it('ne transforme jamais X en heures travaillees', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', 'X'),
        scanned('2026-06-23', 'X'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.normalMinutes).toBe(0);
    expect(result.absenceMinutes).toBe(960);
    expect(result.overtimeMiniMinutes).toBe(0);
    expect(result.overtimeMaxiMinutes).toBe(0);
  });

  it('conserve X mais ne compte pas une absence si des heures existent', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', 'X'),
        scanned('2026-06-22', '8'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result.details[0].values).toEqual(['X', '8']);
    expect(result.normalMinutes).toBe(480);
    expect(result.absenceMinutes).toBe(0);
    expect(result.requiresReview).toBe(true);
  });

  it('calcule RC et les rubriques STC, CP et MA sans compter MU', () => {
    const result = engine.calculate({
      employeeId: 'employee-1',
      scannedDays: [
        scanned('2026-06-22', 'STC'),
        scanned('2026-06-23', 'MU'),
        scanned('2026-06-24', 'RC'),
        scanned('2026-06-25', 'CP'),
        scanned('2026-06-28', 'MA'),
      ],
      holidayDates: new Set(),
      adjustmentMinutes: 0,
    });

    expect(result).toMatchObject({
      normalMinutes: 480,
      absenceMinutes: 0,
      stcDays: 1,
      paidLeaveDays: 1,
      sickLeaveDays: 1,
      overtimeMiniMinutes: 0,
      overtimeMaxiMinutes: 0,
    });
  });
});
