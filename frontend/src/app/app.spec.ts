import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  afterEach(() => history.replaceState({}, '', location.pathname));

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

  const navigationLabels = (element: HTMLElement) =>
    Array.from(element.querySelectorAll<HTMLElement>('.nav button strong')).map(
      (label) => label.textContent?.trim(),
    );

  it('hides the reserved pages by default', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(navigationLabels(fixture.nativeElement as HTMLElement)).toEqual([
      'Vue d’ensemble',
      'Employés',
      'Feuilles horaires',
      'Rapports pointeuse',
      'Historique des calculs',
    ]);
  });

  it('shows the reserved pages while the admin flag is in the address', () => {
    history.replaceState({}, '', `${location.pathname}?admin=1`);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(navigationLabels(fixture.nativeElement as HTMLElement)).toEqual([
      'Vue d’ensemble',
      'Employés',
      'Feuilles horaires',
      'Rapports pointeuse',
      'Jours fériés',
      'Historique des calculs',
      'Documents',
    ]);
  });

  it('opens and closes the mobile menu when navigating', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.menu-toggle')!;
    const employeesButton = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.nav button'),
    ).find((button) => button.textContent?.includes('Employés'))!;

    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('.sidebar')?.classList).toContain('open');

    employeesButton.click();
    fixture.detectChanges();
    expect(element.querySelector('.sidebar')?.classList).not.toContain('open');
    expect(element.querySelector('main h1')?.textContent).toContain('Employés');
  });

  it('rejects a scan larger than 12 MB before upload', () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance as unknown as {
      addScanFiles: (event: Event) => void;
      scanFiles: () => File[];
      scanError: () => string;
    };
    const input = {
      files: [
        {
          name: 'grande-photo.jpg',
          type: 'image/jpeg',
          size: 12 * 1024 * 1024 + 1,
        } as File,
      ],
      value: 'selected',
    };

    component.addScanFiles({ target: input } as unknown as Event);

    expect(component.scanFiles()).toEqual([]);
    expect(component.scanError()).toContain('maximum 12 Mo');
  });
});
