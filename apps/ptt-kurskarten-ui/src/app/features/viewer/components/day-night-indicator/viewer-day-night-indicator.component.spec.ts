import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ViewerDayNightIndicatorComponent } from './viewer-day-night-indicator.component';

describe('ViewerDayNightIndicatorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewerDayNightIndicatorComponent],
    }).compileComponents();
  });

  it('renders the card, horizon, and moving wave field', () => {
    const fixture = createComponent(720);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.day-night-card')).toBeTruthy();
    expect(host.querySelector('.day-night-horizon')).toBeTruthy();
    expect(host.querySelectorAll('.day-night-wave').length).toBeGreaterThan(0);
    expect(host.querySelector('.day-night-waves')?.getAttribute('transform')).toContain(
      'translate(',
    );
  });

  it('keeps the symbol horizontally centered while moving it vertically', () => {
    const fixture = createComponent(0);
    const midnight = getSymbolPosition(fixture);

    fixture.componentRef.setInput('minuteOfDay', 360);
    fixture.detectChanges();
    const dawn = getSymbolPosition(fixture);

    fixture.componentRef.setInput('minuteOfDay', 720);
    fixture.detectChanges();
    const noon = getSymbolPosition(fixture);

    expect(midnight.x).toBeCloseTo(dawn.x, 6);
    expect(dawn.x).toBeCloseTo(noon.x, 6);
    expect(midnight.y).not.toBeCloseTo(dawn.y, 3);
    expect(dawn.y).not.toBeCloseTo(noon.y, 3);
  });

  it('shows the sun above the horizon and the moon below it', () => {
    const fixture = createComponent(720);

    expect(getOpacity(fixture, '.day-night-sun')).toBeGreaterThan(0.95);
    expect(getOpacity(fixture, '.day-night-moon')).toBeLessThan(0.05);

    fixture.componentRef.setInput('minuteOfDay', 0);
    fixture.detectChanges();

    expect(getOpacity(fixture, '.day-night-sun')).toBeLessThan(0.05);
    expect(getOpacity(fixture, '.day-night-moon')).toBeGreaterThan(0.95);
  });

  it('fades sun rays before the sunset horizon crossing', () => {
    const fixture = createComponent(720);
    const noonRays = getOpacity(fixture, '.day-night-rays');

    fixture.componentRef.setInput('minuteOfDay', 1020);
    fixture.detectChanges();
    const nearHorizonRays = getOpacity(fixture, '.day-night-rays');

    fixture.componentRef.setInput('minuteOfDay', 1140);
    fixture.detectChanges();
    const horizonRays = getOpacity(fixture, '.day-night-rays');

    expect(noonRays).toBeGreaterThan(nearHorizonRays);
    expect(nearHorizonRays).toBeGreaterThanOrEqual(horizonRays);
    expect(horizonRays).toBeLessThan(0.05);
  });

  it('moves the wave field as the input minute changes', () => {
    const fixture = createComponent(120);
    const earlyTransform = getRequiredElement(fixture, '.day-night-waves').getAttribute(
      'transform',
    );

    fixture.componentRef.setInput('minuteOfDay', 780);
    fixture.detectChanges();
    const lateTransform = getRequiredElement(fixture, '.day-night-waves').getAttribute('transform');

    expect(earlyTransform).not.toBe(lateTransform);
  });
});

function createComponent(minuteOfDay: number) {
  const fixture = TestBed.createComponent(ViewerDayNightIndicatorComponent);
  fixture.componentRef.setInput('minuteOfDay', minuteOfDay);
  fixture.detectChanges();
  return fixture;
}

function getRequiredElement(
  fixture: ReturnType<typeof createComponent>,
  selector: string,
): Element {
  const element = fixture.nativeElement.querySelector(selector);
  expect(element, `Expected element ${selector} to exist`).toBeTruthy();
  return element as Element;
}

function getSymbolPosition(fixture: ReturnType<typeof createComponent>): { x: number; y: number } {
  const transform =
    getRequiredElement(fixture, '.day-night-symbol').getAttribute('transform') ?? '';
  const match = transform.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
  expect(match).toBeTruthy();
  return {
    x: Number(match?.[1] ?? NaN),
    y: Number(match?.[2] ?? NaN),
  };
}

function getOpacity(fixture: ReturnType<typeof createComponent>, selector: string): number {
  return Number(getRequiredElement(fixture, selector).getAttribute('opacity') ?? '1');
}
