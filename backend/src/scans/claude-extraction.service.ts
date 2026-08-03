import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ScanFile {
  buffer: Buffer;
  mimetype: string;
}

interface EmployeeReference {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
}

export interface ClaudeExtraction {
  rows: {
    employeeId: string | null;
    extractedFullName: string;
    matchedFullName: string | null;
    sourceRowLabel: string | null;
    requiresReview: boolean;
    days: {
      date: string;
      value: string;
      confidence: number;
      needsReview: boolean;
    }[];
  }[];
}

@Injectable()
export class ClaudeExtractionService {
  constructor(private readonly config: ConfigService) {}

  async extract(
    file: ScanFile,
    employees: EmployeeReference[],
    startDate: Date,
    endDate: Date,
  ): Promise<ClaudeExtraction> {
    if (this.mockExtractionEnabled()) {
      return this.mockExtraction(employees, startDate, endDate);
    }

    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      if (this.mockExtractionEnabled()) {
        return this.mockExtraction(employees, startDate, endDate);
      }
      throw new ServiceUnavailableException(
        'La cle ANTHROPIC_API_KEY doit etre configuree.',
      );
    }

    const mediaBlock =
      file.mimetype === 'application/pdf'
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: file.buffer.toString('base64'),
            },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.mimetype,
              data: file.buffer.toString('base64'),
            },
          };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:
          this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
          'claude-fable-5',
        max_tokens: 32000,
        system:
          'Tu es un specialiste de l’extraction de feuilles horaires BHM manuscrites. Lis la grille avec precision, conserve les lectures incertaines comme elements a verifier et ne cree aucune ligne absente du tableau.',
        messages: [
          {
            role: 'user',
            content: [
              mediaBlock,
              {
                type: 'text',
                text: this.prompt(employees, startDate, endDate),
              },
            ],
          },
        ],
        output_config: {
          effort: 'medium',
          format: {
            type: 'json_schema',
            schema: this.outputSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      if (
        this.mockExtractionEnabled() &&
        details.toLowerCase().includes('credit balance is too low')
      ) {
        return this.mockExtraction(employees, startDate, endDate);
      }
      throw new BadGatewayException(
        `Extraction Claude impossible (${response.status}): ${details.slice(0, 300)}`,
      );
    }

    const message = (await response.json()) as {
      stop_reason: string;
      content: { type: string; text?: string }[];
    };
    if (message.stop_reason === 'max_tokens') {
      throw new BadGatewayException('Reponse Claude incomplete.');
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) throw new BadGatewayException('Claude n’a retourne aucun JSON.');

    return JSON.parse(text) as ClaudeExtraction;
  }

  private mockExtractionEnabled() {
    return this.config.get<string>('ENABLE_MOCK_EXTRACTION') === 'true';
  }

  private mockExtraction(
    employees: EmployeeReference[],
    startDate: Date,
    endDate: Date,
  ): ClaudeExtraction {
    const dates = this.datesBetween(startDate, endDate);
    return {
      rows: employees.slice(0, 6).map((employee, employeeIndex) => {
        let workdayIndex = 0;
        return {
          employeeId: employee.id,
          extractedFullName: `${employee.firstName} ${employee.lastName}`,
          matchedFullName: `${employee.firstName} ${employee.lastName}`,
          sourceRowLabel: 'Extraction simulée',
          requiresReview: false,
          days: dates.map((date) => {
            const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
            if (weekday !== 5 && weekday !== 6) workdayIndex += 1;
            return {
              date,
              value: this.mockDayValue(date, employeeIndex, workdayIndex),
              confidence: 1,
              needsReview: false,
            };
          }),
        };
      }),
    };
  }

  private mockDayValue(
    date: string,
    employeeIndex: number,
    workdayIndex: number,
  ) {
    const current = new Date(`${date}T00:00:00.000Z`);
    const weekday = current.getUTCDay();
    if (weekday === 5 || weekday === 6) {
      return employeeIndex === 0 ? '8' : 'X';
    }
    if (workdayIndex === 1) {
      return ['CP', 'MA', 'STC', 'RC', 'MU', 'A'][employeeIndex] ?? 'A';
    }
    if (workdayIndex === 2) return '8D';
    if (workdayIndex === 3) return '8F';
    if (workdayIndex === 4) return '9';
    if (workdayIndex === 5 && employeeIndex === 0) return 'T';
    return '8';
  }

  private prompt(
    employees: EmployeeReference[],
    startDate: Date,
    endDate: Date,
  ) {
    const references = employees.map((employee) => ({
      employeeId: employee.id,
      matricule: employee.matricule,
      fullName: `${employee.firstName} ${employee.lastName}`,
      alternateName: `${employee.lastName} ${employee.firstName}`,
    }));
    const expectedDates = this.datesBetween(startDate, endDate);

    return [
      'Tu extrais une feuille horaire mensuelle BHM manuscrite.',
      `Periode attendue: du ${this.date(startDate)} au ${this.date(endDate)} inclus.`,
      'Ignore le logo, les titres, les sous-titres, les signatures, les notes hors tableau et les lignes entierement vides.',
      'Lis uniquement la grille principale des horaires.',
      'Le titre Atelier ne represente pas une donnee. Le nom manuscrit peut occuper les zones Atelier et Nom et Prenom: lis-les comme une seule zone d’identite.',
      'Extrais chaque vraie ligne employe visible dans la grille.',
      'Associe la ligne au meilleur employe connu a partir du nom complet. Le nom et le prenom peuvent etre inverses.',
      `Pour chaque ligne, retourne exactement une valeur pour chacune de ces dates, dans le meme ordre: ${expectedDates.join(', ')}.`,
      'Valeurs autorisees par case: nombre d’heures, A, 0, X, T, F, STC, MU, RC, CP, MA, heures combinees avec D ou F, ou chaine vide.',
      'Preserve exactement les codes manuscrits suivants en majuscules: STC, MU, RC, CP et MA. Ne les remplace jamais par un autre code.',
      'A, 0 et X indiquent une absence sans heures. STC indique une fin de contrat. MU indique une mutation vers un autre chantier. RC indique une recuperation. CP indique un conge paye. MA indique une maladie. T indique une journée de travail à la tâche et ne représente aucune heure.',
      'Une case peut combiner une lettre et des heures, dans les deux ordres: 8D ou D8, 8F ou F8.',
      'Retourne toujours la forme canonique avec les heures en premier: 8D pour un deplacement et 8F pour un travail un jour ferie.',
      'D signifie deplacement avec les heures travaillees du meme jour. F signifie jour ferie avec les heures travaillees du meme jour.',
      'Ne retourne jamais D seul: un deplacement doit toujours etre associe aux heures visibles dans la meme case.',
      'Ne devine pas une valeur illisible: conserve la meilleure lecture, reduis confidence et mets needsReview a true.',
      `Employes connus: ${JSON.stringify(references)}`,
    ].join('\n');
  }

  private outputSchema() {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'employeeId',
              'extractedFullName',
              'matchedFullName',
              'sourceRowLabel',
              'requiresReview',
              'days',
            ],
            properties: {
              employeeId: { type: ['string', 'null'] },
              extractedFullName: { type: 'string' },
              matchedFullName: { type: ['string', 'null'] },
              sourceRowLabel: { type: ['string', 'null'] },
              requiresReview: { type: 'boolean' },
              days: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['date', 'value', 'confidence', 'needsReview'],
                  properties: {
                    date: { type: 'string' },
                    value: { type: 'string' },
                    confidence: { type: 'number' },
                    needsReview: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private date(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private datesBetween(startDate: Date, endDate: Date) {
    const dates: string[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dates.push(this.date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
}
