import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();
  });

  it('opens directly on the dashboard without authentication', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Préparer l’opération mensuelle');
    expect(element.textContent).not.toContain('Se connecter');
  });

  it('shows the final navigation pages', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const labels = Array.from(
      element.querySelectorAll<HTMLElement>('.nav button strong'),
    ).map((label) => label.textContent?.trim());

    expect(labels).toEqual([
      'Vue d’ensemble',
      'Employés',
      'Feuilles horaires',
      'Rapports requis',
      'Jours fériés',
      'Historique des calculs',
      'Documents',
    ]);
  });
});
