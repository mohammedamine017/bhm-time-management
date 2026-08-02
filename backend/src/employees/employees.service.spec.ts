import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  const service = new EmployeesService(
    {} as never,
    {} as never,
    {} as never,
  );

  it('rejects a preview request without an Excel file', async () => {
    await expect(service.preview(undefined as never)).rejects.toThrow(
      'Aucun fichier Excel recu.',
    );
  });
});
