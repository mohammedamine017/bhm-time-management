import type { ConfigService } from '@nestjs/config';
import { ClaudeExtractionService } from './claude-extraction.service';

describe('ClaudeExtractionService mock fallback', () => {
  it('retourne une grille complète avec les rubriques métier du mock local', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'ENABLE_MOCK_EXTRACTION' ? 'true' : undefined,
      ),
    } as unknown as ConfigService;
    const service = new ClaudeExtractionService(config);

    const result = await service.extract(
      { buffer: Buffer.from(''), mimetype: 'image/jpeg' },
      [
        {
          id: 'employee-1',
          matricule: 'BHM-001',
          firstName: 'Ahmed',
          lastName: 'Benali',
        },
      ],
      new Date('2026-06-20T00:00:00.000Z'),
      new Date('2026-07-19T00:00:00.000Z'),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].days).toHaveLength(30);
    expect(result.rows[0].days.some((day) => day.value === 'T')).toBe(true);
    expect(result.rows[0].days.some((day) => day.value === '8D')).toBe(true);
  });
});
