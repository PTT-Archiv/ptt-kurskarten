import { isPlatformBrowser } from '@angular/common';
import { Component, Input, OnChanges, OnInit, PLATFORM_ID, SimpleChanges, inject } from '@angular/core';

export type BorderUncertaintyConfig = {
  seed: number;
  coreStepPx: number;
  coreRadiusMin: number;
  coreRadiusMax: number;
  coreOpacityMin: number;
  coreOpacityMax: number;
  bandsCount: number;
  bandWidthPx: number;
  bandJitterPx: number;
  bandBaseDensity: number;
  bandFalloff: number;
  bandRadiusMin: number;
  bandRadiusMax: number;
  gridCellPx: number;
  distanceQuantPx: number;
  zoneWidthPx: number;
  mode: 'both' | 'outsideOnly' | 'insideOnly';
  stylePreset?: 'smoothBands' | 'hardBands';
};

type DotSample = {
  x: number;
  y: number;
  normalX: number;
  normalY: number;
};

type RenderDot = {
  x: number;
  y: number;
  r: number;
  o: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export const DEFAULT_SWITZERLAND_PATH_D =
  'M 468.14 12.08 474.85 4.09 485.85 14.37 482.61 20.52 485.61 27.89 494.74 27.61 494.77 21 499.42 21.13 509.67 28.47 506.5 29.27 509.17 33.58 518.52 38.27 537.49 30.96 566.39 32.52 568.81 36.12 582.05 37.37 630.31 65.77 637.1 79.38 648.74 86.39 647.32 101.18 622.05 149.15 627.1 175.14 621.22 186.61 654.87 187.66 688.25 197.11 691.95 219.56 734.07 238.77 749.72 233.17 755.12 218.5 765.75 218.28 768.51 207.51 777.72 199.18 794.16 213.65 793.44 240.43 788.27 249.18 790.7 260.16 781.03 281.87 786.01 290.29 797.35 293.76 799 305.26 795.53 315.83 769.16 313.4 758.23 307.58 757.67 296.67 750.25 294.66 732.05 301.04 722.94 319.64 725.49 336.47 722.54 341.88 743.16 352.29 735.13 371.52 747.63 388.13 745.47 393.11 727.35 399.58 725.06 389.51 715.13 380.09 712.25 365.32 704.05 361.72 677.65 370.87 669.06 367.98 667.28 378.06 661.37 383.34 636.86 382.27 620.01 363.07 617.49 331.61 608.85 340 602.67 332.1 590.56 332.51 583.08 348.27 587.26 353.27 590.29 375.04 581.95 400.9 571.34 416.23 558.59 425.25 553.41 444.92 543.35 450.88 545.98 462.67 539.88 470.15 554.97 486.6 544.52 506.86 533.2 503.46 526.16 505.76 528.05 491.12 520.39 474.95 501.83 466.05 513.31 444.51 508.68 438.61 493.44 433.8 485.23 437.45 471.65 430.74 455.04 409.19 442.13 402.32 439.35 391.99 442.9 356.97 439.62 347.71 434.52 346.88 419.9 351.79 413.93 368.13 398.3 383.9 379.71 393.64 377.21 398.32 387.37 412.98 384.16 430.7 369.04 440 362.17 463.57 346.55 468.11 334.68 485.46 310.13 481.92 301 472.3 282.79 467.78 250.76 487.33 237.32 485.88 213.49 495.26 198.01 491.69 188.81 480.6 183.99 465.26 171.13 450.97 159.69 450.62 163.06 434.59 146.21 428.7 146.42 415.62 155.98 394.29 142.42 374.7 149.07 357.17 118.47 346.19 95.31 347.8 80.08 357.96 63 361.23 47.19 381.23 51.17 393.47 57.98 394.8 58.81 400.72 27.57 426.21 13.45 423.58 1 427.82 5.48 417.57 1.34 406.95 24.81 398.56 33.59 369.77 28.75 360.17 19.29 354.14 21.28 340.93 36.05 320.56 31.37 312.33 86.83 267.72 84.84 257.11 90.23 242.95 87.06 229.75 89.79 220.8 117.28 210.26 129.06 201.48 133.45 186.93 180.35 144.53 180.84 132.93 194.47 123.02 188.86 113.1 164.93 116.52 175.39 98.49 186.72 91.55 183.7 82.08 190.05 79.52 219.73 82.46 217.52 93.91 229.63 100.8 258.89 95.35 262.87 88.47 260.27 82.05 269.5 84.16 272.46 81.34 271.15 75.72 276.04 71.07 272.15 68.7 298.88 55.16 302.8 54.74 300.54 61.16 294.17 62.91 306.96 68.13 321.4 65.08 330.52 54.95 344.15 56.79 346.61 63.77 369.17 63.62 392.74 49.26 402.07 47.59 411.72 49.07 414.87 55.09 423.17 57.85 439.59 56.81 441.75 51.19 452.19 47.01 458.95 55.24 466.77 37.99 459.99 36.39 441.03 42.55 429.36 36.14 429.4 27.42 437.24 21.26 441.55 10.77 456.68 6.63 457.75 1 465.26 2.57 468.14 12.08 Z';

export const DEFAULT_BORDER_UNCERTAINTY_CONFIG: BorderUncertaintyConfig = {
  seed: 1852,
  coreStepPx: 7,
  coreRadiusMin: 0,
  coreRadiusMax: 0,
  coreOpacityMin: 0,
  coreOpacityMax: 0,
  bandsCount: 5,
  bandWidthPx: 14,
  bandJitterPx: 4,
  bandBaseDensity: 0.85,
  bandFalloff: 0.55,
  bandRadiusMin: 0.65,
  bandRadiusMax: 1.3,
  gridCellPx: 4,
  distanceQuantPx: 6,
  zoneWidthPx: 96,
  mode: 'both',
  stylePreset: 'smoothBands'
};

@Component({
  selector: 'app-border-uncertainty-layer',
  standalone: true,
  template: `
    <svg
      class="border-uncertainty-svg"
      viewBox="0 0 800 508"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      [style.transform]="mapTransform"
      [style.transform-origin]="'0 0'"
    >
      <g>
        @for (dot of bandDots; track $index) {
          <rect
            [attr.x]="dot.x - dot.r"
            [attr.y]="dot.y - dot.r"
            [attr.width]="dot.r * 2"
            [attr.height]="dot.r * 2"
            fill="#b3b3b397"
            [attr.opacity]="dot.o"
          ></rect>
        }
      </g>
      <g>
        @for (dot of coreDots; track $index) {
          <rect
            [attr.x]="dot.x - dot.r"
            [attr.y]="dot.y - dot.r"
            [attr.width]="dot.r * 2"
            [attr.height]="dot.r * 2"
            fill="#b3b3b46e"
            [attr.opacity]="dot.o"
          ></rect>
        }
      </g>
    </svg>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        display: block;
        pointer-events: none;
      }

      .border-uncertainty-svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }
    `
  ]
})
export class BorderUncertaintyLayerComponent implements OnInit, OnChanges {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @Input() pathD = DEFAULT_SWITZERLAND_PATH_D;
  @Input() config: Partial<BorderUncertaintyConfig> = {};
  @Input() mapTransform = '';

  resolvedConfig: BorderUncertaintyConfig = { ...DEFAULT_BORDER_UNCERTAINTY_CONFIG };
  coreDots: RenderDot[] = [];
  bandDots: RenderDot[] = [];

  ngOnInit(): void {
    this.rebuildDots();
  }

  ngOnChanges(_: SimpleChanges): void {
    this.rebuildDots();
  }

  private rebuildDots(): void {
    this.resolvedConfig = resolveConfig(this.config);
    if (!this.isBrowser || !this.pathD) {
      this.coreDots = [];
      this.bandDots = [];
      return;
    }

    const { coreDots, bandDots } = generateBorderDots(this.pathD, this.resolvedConfig);
    this.coreDots = coreDots;
    this.bandDots = bandDots;
  }
}

function resolveConfig(partial: Partial<BorderUncertaintyConfig>): BorderUncertaintyConfig {
  const merged: BorderUncertaintyConfig = { ...DEFAULT_BORDER_UNCERTAINTY_CONFIG, ...partial };
  if (merged.stylePreset === 'hardBands') {
    merged.distanceQuantPx = partial.distanceQuantPx ?? 10;
    merged.gridCellPx = partial.gridCellPx ?? 6;
    merged.bandWidthPx = partial.bandWidthPx ?? 18;
  } else {
    merged.distanceQuantPx = partial.distanceQuantPx ?? 6;
    merged.gridCellPx = partial.gridCellPx ?? 4;
  }
  return merged;
}

function generateBorderDots(pathD: string, cfg: BorderUncertaintyConfig): { coreDots: RenderDot[]; bandDots: RenderDot[] } {
  const rng = mulberry32(cfg.seed >>> 0);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathD);

  const totalLength = path.getTotalLength();
  const coreSamples: DotSample[] = [];
  const coreDots: RenderDot[] = [];
  const bandDots: RenderDot[] = [];

  const drawCore = cfg.coreRadiusMax > 0 && cfg.coreOpacityMax > 0;
  for (let l = 0; l <= totalLength; l += cfg.coreStepPx) {
    const p = path.getPointAtLength(l);
    const eps = 1.5;
    const prev = path.getPointAtLength(Math.max(0, l - eps));
    const next = path.getPointAtLength(Math.min(totalLength, l + eps));

    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = -ty / tLen;
    const ny = tx / tLen;

    coreSamples.push({ x: p.x, y: p.y, normalX: nx, normalY: ny });

    if (drawCore) {
      coreDots.push({
        x: p.x + randomRange(rng, -0.5, 0.5),
        y: p.y + randomRange(rng, -0.5, 0.5),
        r: randomRange(rng, cfg.coreRadiusMin, cfg.coreRadiusMax),
        o: randomRange(rng, cfg.coreOpacityMin, cfg.coreOpacityMax)
      });
    }
  }

  const attemptsPerBand = 8;
  for (const sample of coreSamples) {
    for (let i = 0; i < cfg.bandsCount; i += 1) {
      const density = cfg.bandBaseDensity * Math.pow(cfg.bandFalloff, i);
      const signs = resolveSigns(cfg.mode);
      for (const sign of signs) {
        for (let k = 0; k < attemptsPerBand; k += 1) {
          if (rng() > density) {
            continue;
          }

          // Start band 0 directly on the border so the texture can spill over without a visual gap.
          const target = Math.max(0, i * cfg.bandWidthPx + randomRange(rng, -cfg.bandJitterPx, cfg.bandJitterPx));
          const dQ = Math.round(target / cfg.distanceQuantPx) * cfg.distanceQuantPx;

          let x = sample.x + sample.normalX * dQ * sign;
          let y = sample.y + sample.normalY * dQ * sign;

          x = Math.round(x / cfg.gridCellPx) * cfg.gridCellPx;
          y = Math.round(y / cfg.gridCellPx) * cfg.gridCellPx;

          bandDots.push({
            x,
            y,
            r: randomRange(rng, cfg.bandRadiusMin, cfg.bandRadiusMax) * Math.pow(0.95, i),
            o: clamp(randomRange(rng, 0.3, 0.78) * Math.pow(0.9, i), 0.04, 0.78)
          });
        }
      }
    }
  }

  return {
    coreDots: mergeOverlappingDots(coreDots),
    bandDots: mergeOverlappingDots(bandDots)
  };
}

function resolveSigns(mode: BorderUncertaintyConfig['mode']): Array<-1 | 1> {
  if (mode === 'outsideOnly') {
    return [1];
  }
  if (mode === 'insideOnly') {
    return [-1];
  }
  return [1, -1];
}

function randomRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mergeOverlappingDots(dots: RenderDot[]): RenderDot[] {
  const merged = new Map<string, RenderDot>();
  for (const dot of dots) {
    const key = `${Math.round(dot.x * 100) / 100}:${Math.round(dot.y * 100) / 100}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...dot });
      continue;
    }
    existing.r = Math.max(existing.r, dot.r);
    existing.o = Math.max(existing.o, dot.o);
  }
  return Array.from(merged.values());
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/*
Usage snippet (mount between map background and graph canvas):

<app-border-uncertainty-layer
  [pathD]="switzerlandPathD"
  [config]="{ seed: 1852, stylePreset: 'hardBands', mode: 'both' }"
></app-border-uncertainty-layer>
*/
