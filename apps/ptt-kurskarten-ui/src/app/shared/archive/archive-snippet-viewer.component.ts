import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import { TileSourceSpecifier } from 'openseadragon';

@Component({
  selector: 'app-archive-snippet-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FaIconComponent, TranslocoPipe],
  templateUrl: './archive-snippet-viewer.component.html',
  styleUrl: './archive-snippet-viewer.component.css'
})
export class ArchiveSnippetViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  @Input({ required: true }) imageUrl = '';
  @Input() iiifInfoUrl = 'https://iiif.ptt-archiv.ch/iiif/3/P-38-2-1852-07.jp2/info.json';
  @Input() initialCenterX: number | null = null;
  @Input() initialCenterY: number | null = null;
  @Input() initialZoomFactor = 1.5;
  @Input() autoFit = true;
  @Input() allowWrite = false;
  @Input() showCenterMarker = true;
  @Input() emitOnAutoFit = false;
  @Input() fillFrame = false;
  @Output() regionChange = new EventEmitter<{ iiifCenterX: number; iiifCenterY: number }>();
  @ViewChild('osdContainer') private osdContainer?: ElementRef<HTMLDivElement>;

  private viewer: OpenSeadragon.Viewer | null = null;
  private pendingRegionUrl: string | null = null;
  private suppressNextViewportEvent = false;
  private viewportDebounce?: ReturnType<typeof setTimeout>;
  private lastEmittedCenter?: { x: number; y: number };
  readonly zoomInIcon = faMagnifyingGlassPlus;
  readonly zoomOutIcon = faMagnifyingGlassMinus;
  readonly resetIcon = faRotateLeft;

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.initViewer();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['imageUrl']) {
      this.pendingRegionUrl = this.imageUrl;
    }
    if (changes['iiifInfoUrl'] && this.viewer) {
      const tileSource = { tileSource: this.iiifInfoUrl } as TileSourceSpecifier;
      this.viewer.open(tileSource)
      return;
    }
    if (!this.isBrowser || !this.viewer) {
      return;
    }
    if (changes['imageUrl'] && this.autoFit) {
      this.applyRegionFromUrl(this.pendingRegionUrl ?? undefined);
    }
    if (changes['autoFit'] && this.autoFit) {
      this.applyRegionFromUrl(this.pendingRegionUrl ?? this.imageUrl);
    }
    if ((changes['initialCenterX'] || changes['initialCenterY']) && this.autoFit && !(this.pendingRegionUrl ?? this.imageUrl)) {
      this.applyRegionFromUrl(this.pendingRegionUrl ?? this.imageUrl);
    }
  }

  ngOnDestroy(): void {
    if (this.viewportDebounce) {
      clearTimeout(this.viewportDebounce);
    }
    this.viewer?.destroy();
    this.viewer = null;
  }

  zoomIn(): void {
    if (!this.isBrowser || !this.viewer) {
      return;
    }
    this.viewer.viewport.zoomBy(1.2);
    this.viewer.viewport.applyConstraints();
  }

  zoomOut(): void {
    if (!this.isBrowser || !this.viewer) {
      return;
    }
    this.viewer.viewport.zoomBy(0.85);
    this.viewer.viewport.applyConstraints();
  }

  reset(): void {
    if (!this.isBrowser) {
      return;
    }
    this.applyRegionFromUrl(this.pendingRegionUrl ?? this.imageUrl);
  }

  emitCurrentCenter(force = false): void {
    if (!this.viewer || (!this.allowWrite && !force)) {
      return;
    }
    const item = this.viewer.world.getItemAt(0);
    if (!item) {
      return;
    }
    const center = this.viewer.viewport.getCenter(true);
    const imageCenter = item.viewportToImageCoordinates(center);
    const next = { x: Math.round(imageCenter.x), y: Math.round(imageCenter.y) };
    this.lastEmittedCenter = next;
    this.regionChange.emit({ iiifCenterX: next.x, iiifCenterY: next.y });
  }

  private initViewer(): void {
    const element = this.osdContainer?.nativeElement;
    if (!element || this.viewer) {
      return;
    }
    import('openseadragon').then((module) => {
      if (this.viewer) {
        return;
      }
      const OpenSeadragon = module.default ?? module;
      this.viewer = OpenSeadragon({
        element,
        showNavigationControl: false,
        animationTime: 0.7,
        blendTime: 0.1,
        constrainDuringPan: true,
        gestureSettingsMouse: {
          scrollToZoom: true,
          clickToZoom: false,
          dblClickToZoom: true,
          dragToPan: true,
          pinchToZoom: false
        },
        gestureSettingsTouch: {
          scrollToZoom: false,
          clickToZoom: false,
          dblClickToZoom: false,
          dragToPan: true,
          pinchToZoom: true
        }
      });

      this.viewer.addHandler('open', () => {
        this.pendingRegionUrl = this.imageUrl || this.pendingRegionUrl;
        if (this.autoFit) {
          this.applyRegionFromUrl(this.pendingRegionUrl ?? undefined);
        }
      });
      this.viewer.addHandler('viewport-change', () => this.onViewportChange());
      this.viewer.addHandler('canvas-drag-end', () => this.onViewportChange(true));
      this.viewer.addHandler('animation-finish', () => this.onViewportChange(true));
      const tileSource = {tileSource: this.iiifInfoUrl} as TileSourceSpecifier;
      this.viewer.open(tileSource);
    });
  }

  private applyRegionFromUrl(urlOverride?: string): void {
    if (!this.viewer) {
      return;
    }
    const url = urlOverride ?? this.imageUrl;
    const region = url ? this.parseRegion(url) : null;
    if (!region) {
      this.applyDefaultViewport();
      return;
    }
    const item = this.viewer.world.getItemAt(0);
    if (!item) {
      return;
    }
    const contentSize = item.getContentSize();
    const maxW = Math.max(1, Math.round(contentSize.x));
    const maxH = Math.max(1, Math.round(contentSize.y));
    const w = Math.max(64, Math.min(region.w, maxW));
    const h = Math.max(64, Math.min(region.h, maxH));
    const x = Math.max(0, Math.min(region.x, maxW - w));
    const y = Math.max(0, Math.min(region.y, maxH - h));
    const rect = item.imageToViewportRectangle(x, y, w, h);
    this.suppressNextViewportEvent = true;
    this.viewer.viewport.fitBounds(rect, true);
    this.viewer.viewport.applyConstraints();
    if (this.emitOnAutoFit && this.allowWrite) {
      setTimeout(() => this.emitCurrentCenter(), 0);
    }
  }

  private applyDefaultViewport(): void {
    if (!this.viewer) {
      return;
    }
    this.suppressNextViewportEvent = true;
    this.viewer.viewport.goHome(true);
    const item = this.viewer.world.getItemAt(0);
    if (!item) {
      this.viewer.viewport.applyConstraints();
      return;
    }
    const center =
      this.initialCenterX !== null && this.initialCenterY !== null
        ? item.imageToViewportCoordinates(this.initialCenterX, this.initialCenterY, true)
        : this.viewer.viewport.getCenter(true);
    this.viewer.viewport.panTo(center, true);
    if (this.initialZoomFactor > 0 && Math.abs(this.initialZoomFactor - 1) > 0.0001) {
      this.viewer.viewport.zoomTo(this.viewer.viewport.getZoom(true) * this.initialZoomFactor, center, true);
    }
    this.viewer.viewport.applyConstraints();
  }

  private parseRegion(url: string): { x: number; y: number; w: number; h: number } | null {
    const match = url.match(/\/(-?\d+),(-?\d+),(\d+),(\d+)\//);
    if (!match) {
      return null;
    }
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4])
    };
  }

  private onViewportChange(immediate = false): void {
    if (!this.viewer || !this.allowWrite) {
      return;
    }
    if (this.suppressNextViewportEvent) {
      this.suppressNextViewportEvent = false;
      return;
    }
    const emit = () => {
      if (!this.viewer) {
        return;
      }
      const item = this.viewer.world.getItemAt(0);
      if (!item) {
        return;
      }
      const center = this.viewer.viewport.getCenter(true);
      const imageCenter = item.viewportToImageCoordinates(center);
      const next = { x: Math.round(imageCenter.x), y: Math.round(imageCenter.y) };
      if (this.lastEmittedCenter && this.lastEmittedCenter.x === next.x && this.lastEmittedCenter.y === next.y) {
        return;
      }
      this.lastEmittedCenter = next;
      this.regionChange.emit({ iiifCenterX: next.x, iiifCenterY: next.y });
    };

    if (immediate) {
      emit();
      return;
    }
    if (this.viewportDebounce) {
      clearTimeout(this.viewportDebounce);
    }
    this.viewportDebounce = setTimeout(emit, 120);
  }
}
