import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
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
import type { ConnectionOption, GraphNode, GraphSnapshot, NodeDetail, TimeHHMM, TransportType } from '@ptt-kurskarten/shared';
import { computeTransform, DEFAULT_VIEWBOX, screenToWorld, worldToScreen } from './map-coordinates';
import { buildWaitSegments, getLegAbsTime } from '../routing/connection-details.util';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { BorderUncertaintyLayerComponent } from './border-uncertainty-layer.component';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';

const NODE_RADIUS = 3;
const NODE_RADIUS_MAX = 9;
const NODE_RADIUS_STEP = .3;
const DEFAULT_VIEWPORT_ZOOM = 1.0;
const DEFAULT_INITIAL_VIEWPORT_ZOOM = 0.85;
const DEFAULT_INITIAL_VIEWPORT_OFFSET_Y = -100;
const SELECTED_NODE_FOCUS_ZOOM_DESKTOP = 6.4;
const SELECTED_NODE_FOCUS_ZOOM_COMPACT = 10.2;
const MIN_VIEWPORT_ZOOM = 0.75;
const MAX_VIEWPORT_ZOOM = 20;
const EDGE_LINE_WIDTH = 1;
const EDGE_LINE_WIDTH_HIGHLIGHT = 2;
const EDGE_LANE_SPACING = 6;
const DIM_ALPHA = 0.3;
const ROUTE_FIT_PADDING_MIN = 28;
const ROUTE_FIT_PADDING_MAX = 84;
const NODE_COLOR_DEFAULT = '#ffffff';
const NODE_COLOR_FOREIGN = '#ffffff';
const NODE_COLOR_MUTED = '#9a9a9a';
const MINUTES_PER_DAY = 1440;
const MAX_SIMULATION_DOTS = 700;

type SimTripRun = {
  edgeId: string;
  tripId: string;
  fromId: string;
  toId: string;
  transport: TransportType;
  departs?: TimeHHMM;
  arrives: TimeHHMM;
  arrivalDayOffset?: number;
  departMinute: number;
  arriveMinute: number;
  durationMinutes: number;
};

export type MapSimulationTripHit = {
  edgeId: string;
  tripId: string;
  fromId: string;
  toId: string;
  transport: TransportType;
  departs?: TimeHHMM;
  arrives: TimeHHMM;
  arrivalDayOffset?: number;
  progress: number;
  dotX: number;
  dotY: number;
};

@Component({
  selector: 'app-map-stage',
  standalone: true,
  imports: [BorderUncertaintyLayerComponent, FaIconComponent],
  template: `
    <div
      class="stage"
      [class.no-border]="!showBorder"
      (mouseenter)="onStageEnter()"
      (mouseleave)="onStageLeave()"
    >
      <img class="map" src="assets/maps/switzerland.svg" alt="Switzerland map" [style.transform]="getMapTransform()" />
      <app-border-uncertainty-layer
        class="border-uncertainty-layer"
        [mapTransform]="getMapTransform()"
      ></app-border-uncertainty-layer>
      <div class="overlay">
        <canvas
          #graphCanvas
          class="graph-canvas"
          [style.cursor]="getCanvasCursor()"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="onPointerUp($event)"
          (pointerleave)="onPointerLeave()"
          (wheel)="onWheel($event)"
        ></canvas>
        @if (showZoomControls()) {
          <div class="zoom-controls" aria-label="Zoom controls">
            <button type="button" class="zoom-btn" aria-label="Zoom in" (click)="onZoomInClick()">
              <fa-icon [icon]="plusIcon"></fa-icon>
            </button>
            <button type="button" class="zoom-btn" aria-label="Zoom out" (click)="onZoomOutClick()">
              <fa-icon [icon]="minusIcon"></fa-icon>
            </button>
          </div>
        }
        <div class="zoom-hint" [class.visible]="showZoomHint()">
          {{ getZoomHintLabel() }}
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host(.pick-mode) .map {
        opacity: 0.45;
        transition: opacity 150ms ease-out;
      }
      :host(.routing-active) .map {
        opacity: 0.35;
        transition: opacity 150ms ease-out;
      }
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .stage {
        position: relative;
        width: 100%;
        height: 100%;
        background: #000000;
        border: 1px solid var(--ptt-black);
      }

      .stage.no-border {
        border: none;
      }

      .map {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        pointer-events: none;
        transform-origin: 0 0;
        filter: invert(1) grayscale(1) contrast(1.25) brightness(0.85);
      }

      .map {
        position: relative;
        z-index: 1;
      }

      .border-uncertainty-layer {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
      }

      .overlay {
        position: absolute;
        inset: 0;
        pointer-events: auto;
        z-index: 2;
      }

      .graph-canvas {
        width: 100%;
        height: 100%;
        display: block;
        touch-action: none;
      }

      .zoom-controls {
        position: absolute;
        right: 16px;
        bottom: 72px;
        display: grid;
        gap: 8px;
      }

      .zoom-btn {
        width: 34px;
        height: 34px;
        border: 2px solid #ffffff;
        background: #141414;
        color: #ffffff;
        border-radius: 999px;
        font-size: 22px;
        line-height: 1;
        font-weight: 600;
        cursor: pointer;
        display: grid;
        place-items: center;
        padding: 0;
        box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
        transition: background 140ms ease-out, color 140ms ease-out, transform 80ms ease-out;
      }

      .zoom-btn:hover,
      .zoom-btn:focus-visible {
        background: #ffffff;
        color: #141414;
        outline: none;
      }

      .zoom-btn:active {
        transform: translateY(1px);
      }

      .zoom-btn fa-icon {
        font-size: 14px;
      }

      .zoom-hint {
        position: absolute;
        left: 50%;
        bottom: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        line-height: 1.2;
        color: #000;
        background: rgba(255, 255, 255, 0.85);
        opacity: 0;
        transform: translate(-50%, 4px);
        transition: opacity 140ms ease-out, transform 140ms ease-out;
        pointer-events: none;
      }

      .zoom-hint.visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      @media (max-width: 1023px) {
        .zoom-controls {
          right: 12px;
          bottom: 12px;
          gap: 8px;
        }

        .zoom-hint {
          left: auto;
          right: 12px;
          bottom: 100px;
          max-width: min(220px, calc(100% - 24px));
          transform: translateY(4px);
        }

        .zoom-hint.visible {
          transform: translateY(0);
        }
      }

      @media (max-width: 767px) {
        .zoom-btn {
          width: 36px;
          height: 36px;
        }
      }
    `
  ]
})
export class MapStageComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly plusIcon = faPlus;
  readonly minusIcon = faMinus;

  @Input({ required: true }) graph: GraphSnapshot | null = null;
  @Input() nodeDetail: NodeDetail | null = null;
  @Input() highlightedEdgeIds: Set<string> | null = null;
  @Input() highlightedNodeIds: Set<string> | null = null;
  @Input() endpointNodeIds: Set<string> | null = null;
  @Input() pulseNodeIds: Set<string> | null = null;
  @Input() pickMode: 'from' | 'to' | null = null;
  @Input() selectedConnection: ConnectionOption | null = null;
  @Input() showConnectionDetailsOnMap = true;
  @Input() selectedNodeId: string | null = null;
  @Input() routingActive = false;
  @Input() tripSimulationMinute: number | null = null;
  @Input() showBorder = true;
  @Input() interactiveViewport = false;
  @Input() resetViewportToken = 0;
  @Input() glowingEdgeId: string | null = null;
  @Input() routeFitTopInset = 0;
  @Input() viewportFocusTopInset = 0;
  @Input() viewportFocusBottomInset = 0;
  @Output() nodeSelected = new EventEmitter<string | null>();
  @Output() mapPointer = new EventEmitter<{
    type: 'down' | 'move' | 'up';
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
    hitSimulationTrip: MapSimulationTripHit | null;
  }>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transloco = inject(TranslocoService);

  @HostBinding('class.pick-mode') get pickModeClass(): boolean {
    return this.pickMode !== null;
  }

  @HostBinding('class.routing-active') get routingActiveClass(): boolean {
    return this.routingActive;
  }

  @ViewChild('graphCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private rafId: number | null = null;
  private resizeObserver?: ResizeObserver;
  private screenNodes = new Map<string, { x: number; y: number; r: number }>();
  private screenNodeLabels = new Map<string, { x: number; y: number; w: number; h: number }>();
  private screenEdges = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  private canvasSize = { width: 0, height: 0 };
  private pendingCanvasSize: { width: number; height: number } | null = null;
  private resizeRafId: number | null = null;
  private transform = computeTransform(1, 1, DEFAULT_VIEWBOX);
  private fitTransform = computeTransform(1, 1, DEFAULT_VIEWBOX);
  private viewportZoom = DEFAULT_VIEWPORT_ZOOM;
  private viewportPan = { x: 0, y: 0 };
  private viewportTouched = false;
  private needsRender = false;
  private activePointerId: number | null = null;
  private activePointers = new Map<number, { x: number; y: number }>();
  private panStart: { x: number; y: number; panX: number; panY: number } | null = null;
  private pinchStart:
    | {
        distance: number;
        zoom: number;
        world: { x: number; y: number };
      }
    | null = null;
  private isPanning = false;
  private suppressTapUntilPointersReleased = false;
  private langSub?: Subscription;
  private hoveredNodeId: string | null = null;
  private stageHover = false;
  private pendingRouteFit = false;
  private pendingSelectedNodeFocusId: string | null = null;
  private viewportMode: 'default' | 'selected-node' | 'connection' | 'manual' = 'default';
  private tripRunsByMinute: SimTripRun[][] = Array.from({ length: MINUTES_PER_DAY }, () => []);
  private screenSimulationDots: Array<{ x: number; y: number; r: number; run: SimTripRun; progress: number }> = [];

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }

    this.attachResizeObserver();
    this.langSub = this.transloco.langChanges$.subscribe(() => this.scheduleRender());
    this.scheduleRender();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.isBrowser) {
      return;
    }

    if (
      changes['graph'] ||
      changes['nodeDetail'] ||
      changes['pulseNodeIds'] ||
      changes['endpointNodeIds'] ||
      changes['pickMode'] ||
      changes['selectedConnection'] ||
      changes['showConnectionDetailsOnMap'] ||
      changes['selectedNodeId'] ||
      changes['routingActive'] ||
      changes['tripSimulationMinute'] ||
      changes['glowingEdgeId'] ||
      changes['routeFitTopInset'] ||
      changes['viewportFocusTopInset'] ||
      changes['viewportFocusBottomInset'] ||
      changes['resetViewportToken']
    ) {
      if (changes['graph']) {
        this.rebuildTripSimulationCache();
        if (this.interactiveViewport && !this.selectedConnection) {
          this.resetViewport();
        }
      }
      if (changes['resetViewportToken'] && this.interactiveViewport) {
        this.resetViewport();
        this.pendingRouteFit = false;
      }
      if (this.interactiveViewport && (changes['selectedConnection'] || changes['graph'])) {
        this.pendingRouteFit = this.selectedConnection !== null;
      }
      if (this.interactiveViewport && changes['routeFitTopInset'] && this.selectedConnection) {
        this.pendingRouteFit = true;
      }
      if (
        this.interactiveViewport &&
        (changes['viewportFocusTopInset'] || changes['viewportFocusBottomInset']) &&
        this.selectedNodeId &&
        !this.selectedConnection
      ) {
        this.pendingSelectedNodeFocusId = this.selectedNodeId;
      }
      if (this.interactiveViewport && changes['selectedNodeId'] && this.selectedNodeId && !this.selectedConnection) {
        this.pendingSelectedNodeFocusId = this.selectedNodeId;
        if (this.focusViewportOnNode(this.selectedNodeId)) {
          this.pendingSelectedNodeFocusId = null;
        }
      }
      this.scheduleRender();
    }
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.langSub?.unsubscribe();
    this.resizeObserver?.disconnect();
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.isBrowser) {
      return;
    }

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const screen = this.getScreenPoint(event);
    this.activePointers.set(event.pointerId, screen);
    this.activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (this.interactiveViewport && this.pickMode === null) {
      if (this.activePointers.size >= 2) {
        this.activePointerId = null;
        this.panStart = null;
        this.isPanning = false;
        this.pinchStart = this.createPinchStart();
        this.suppressTapUntilPointersReleased = true;
      } else {
        this.panStart = {
          x: screen.x,
          y: screen.y,
          panX: this.viewportPan.x,
          panY: this.viewportPan.y
        };
        this.isPanning = false;
      }
    } else {
      this.panStart = null;
      this.isPanning = false;
    }

    const payload = this.buildPointerPayload(event);
    this.mapPointer.emit({ ...payload, type: 'down' });
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isBrowser) {
      return;
    }

    const screen = this.getScreenPoint(event);
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, screen);
    }

    if (this.interactiveViewport && this.pickMode === null && this.activePointers.size >= 2) {
      this.updatePinchViewport();
    }

    if (this.activePointerId === event.pointerId && this.panStart && this.interactiveViewport && this.pickMode === null) {
      const dx = screen.x - this.panStart.x;
      const dy = screen.y - this.panStart.y;
      if (!this.isPanning && Math.hypot(dx, dy) > 3) {
        this.isPanning = true;
      }
      if (this.isPanning) {
        this.viewportPan = {
          x: this.panStart.panX + dx,
          y: this.panStart.panY + dy
        };
        this.viewportTouched = true;
        this.viewportMode = 'manual';
        this.scheduleRender();
      }
    }

    const payload = this.buildPointerPayload(event);
    if (this.activePointerId === event.pointerId || this.activePointerId === null) {
      this.mapPointer.emit({ ...payload, type: 'move' });
    }
    this.updateHoverState(payload.hitNodeId);
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.isBrowser) {
      return;
    }

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already be released/cancelled.
      }
    }
    const hadPinchGesture = this.suppressTapUntilPointersReleased;
    const wasPrimaryPointer = this.activePointerId === event.pointerId;
    if (wasPrimaryPointer) {
      this.activePointerId = null;
    }
    const wasPanning = this.isPanning;
    this.isPanning = false;
    this.panStart = null;
    this.activePointers.delete(event.pointerId);

    if (this.activePointers.size >= 2) {
      this.pinchStart = this.createPinchStart();
    } else {
      this.pinchStart = null;
    }

    if (this.interactiveViewport && this.pickMode === null && this.activePointers.size === 1) {
      const [remainingPointerId, remainingPoint] = this.activePointers.entries().next().value as [number, { x: number; y: number }];
      this.activePointerId = remainingPointerId;
      this.panStart = {
        x: remainingPoint.x,
        y: remainingPoint.y,
        panX: this.viewportPan.x,
        panY: this.viewportPan.y
      };
    }
    if (this.activePointers.size === 0) {
      this.suppressTapUntilPointersReleased = false;
    }

    const payload = this.buildPointerPayload(event);
    if (wasPrimaryPointer || this.activePointers.size === 0) {
      this.mapPointer.emit({ ...payload, type: 'up' });
    }

    if (!wasPanning && !hadPinchGesture) {
      if (payload.hitNodeId) {
        this.nodeSelected.emit(payload.hitNodeId);
      } else if (!payload.hitSimulationTrip && this.pickMode === null && this.selectedNodeId !== null) {
        this.nodeSelected.emit(null);
      }
    }
  }

  onPointerLeave(): void {
    if (!this.isBrowser) {
      return;
    }
    this.updateHoverState(null);
    this.mapPointer.emit({
      type: 'move',
      screen: { x: -1, y: -1 },
      world: { x: 0, y: 0 },
      hitNodeId: null,
      hitEdgeId: null,
      hitSimulationTrip: null
    });
  }

  onWheel(event: WheelEvent): void {
    if (!this.isBrowser || !this.interactiveViewport || this.pickMode !== null) {
      return;
    }
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const currentZoom = this.viewportZoom;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, currentZoom * zoomFactor));
    this.applyZoom(nextZoom, sx, sy);
  }

  onZoomInClick(): void {
    this.zoomByFactor(1.2);
  }

  onZoomOutClick(): void {
    this.zoomByFactor(1 / 1.2);
  }

  onStageEnter(): void {
    this.stageHover = true;
  }

  onStageLeave(): void {
    this.stageHover = false;
  }

  showZoomHint(): boolean {
    return this.interactiveViewport && this.pickMode === null && this.stageHover;
  }

  showZoomControls(): boolean {
    return this.interactiveViewport && this.pickMode === null;
  }

  getCanvasCursor(): string {
    if (this.isPanning) {
      return 'crosshair';
    }
    if (this.hoveredNodeId) {
      return 'pointer';
    }
    return 'default';
  }

  getZoomHintLabel(): string {
    return this.transloco.translate('viewer.zoomHint');
  }

  private attachResizeObserver(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.queueResize());
      if (canvas.parentElement) {
        this.resizeObserver.observe(canvas.parentElement);
      }
    }

    this.queueResize();
  }

  private queueResize(): void {
    if (!this.isBrowser) {
      return;
    }
    if (this.resizeRafId !== null) {
      return;
    }
    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = null;
      this.resizeCanvas();
    });
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.isBrowser) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    const widthDelta = Math.abs(width - this.canvasSize.width);
    const heightDelta = Math.abs(height - this.canvasSize.height);
    if (widthDelta < 2 && heightDelta < 2) {
      return;
    }

    if (width === this.canvasSize.width && height === this.canvasSize.height) {
      return;
    }

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    this.canvasSize = { width, height };
    if (this.interactiveViewport && this.selectedConnection) {
      this.pendingRouteFit = true;
    }
    if (
      this.interactiveViewport &&
      !this.selectedConnection &&
      this.selectedNodeId &&
      this.viewportMode === 'selected-node'
    ) {
      this.pendingSelectedNodeFocusId = this.selectedNodeId;
    }
    if (this.interactiveViewport && !this.selectedConnection && !this.viewportTouched) {
      this.resetViewport();
    }
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (!this.isBrowser) {
      return;
    }

    this.needsRender = true;
    if (this.rafId === null) {
      if (typeof requestAnimationFrame === 'undefined') {
        this.renderFrame();
      } else {
        this.rafId = requestAnimationFrame(() => this.renderFrame());
      }
    }
  }

  private renderFrame(): void {
    this.rafId = null;
    if (!this.needsRender) {
      return;
    }
    this.needsRender = false;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.isBrowser) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const { width, height } = this.canvasSize;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const graph = this.graph;
    if (!graph || graph.nodes.length === 0) {
      return;
    }

    const { nodes, edges } = graph;
    this.fitTransform = computeTransform(width, height, DEFAULT_VIEWBOX);
    if (this.pendingRouteFit && this.interactiveViewport && this.pickMode === null && this.selectedConnection) {
      this.pendingRouteFit = !this.fitViewportToConnection(this.selectedConnection, nodes);
    }
    if (this.pendingSelectedNodeFocusId && this.interactiveViewport && this.pickMode === null && !this.selectedConnection) {
      if (this.focusViewportOnNode(this.pendingSelectedNodeFocusId)) {
        this.pendingSelectedNodeFocusId = null;
      }
    }
    this.transform = {
      scale: this.fitTransform.scale * this.viewportZoom,
      offsetX: this.fitTransform.offsetX * this.viewportZoom + this.viewportPan.x,
      offsetY: this.fitTransform.offsetY * this.viewportZoom + this.viewportPan.y
    };

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const highlightIds = this.getHighlightIds();
    const edgeHighlights = this.highlightedEdgeIds ?? highlightIds.edgeIds;
    const nodeHighlights = this.highlightedNodeIds ?? highlightIds.nodeIds;
    const uncertainRouteEdgeIds = this.getUncertainRouteEdgeIds();
    const routingActive = this.routingActive;
    const selectedFocusActive = !routingActive && this.selectedNodeId !== null;
    const selectedFocusEdgeIds = this.getSelectedNodeEdgeIds(edges);

    this.screenNodes.clear();
    this.screenNodeLabels.clear();
    this.screenEdges.clear();
    this.screenSimulationDots = [];

    const edgeCounts = new Map<string, number>();
    edges.forEach((edge) => {
      edgeCounts.set(edge.from, (edgeCounts.get(edge.from) ?? 0) + 1);
      edgeCounts.set(edge.to, (edgeCounts.get(edge.to) ?? 0) + 1);
    });

    const edgeGroups = new Map<string, GraphSnapshot['edges']>();
    edges.forEach((edge) => {
      const key = `${edge.from}→${edge.to}`;
      const list = edgeGroups.get(key);
      if (list) {
        list.push(edge);
      } else {
        edgeGroups.set(key, [edge]);
      }
    });

    edgeGroups.forEach((group) => {
      group.sort((a, b) => {
        if (a.validFrom !== b.validFrom) {
          return a.validFrom - b.validFrom;
        }
        return a.id.localeCompare(b.id);
      });

      const count = group.length;
      group.forEach((edge, index) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) {
          return;
        }
        const laneIndex = index - (count - 1) / 2;
        const laneOffsetPx = laneIndex * EDGE_LANE_SPACING;
        const isHighlighted = edgeHighlights.has(edge.id);
        const isGlowing = this.glowingEdgeId === edge.id;
        const isDashed = isHighlighted && uncertainRouteEdgeIds.has(edge.id);
        const isDimmed = routingActive && !isHighlighted;
        const isSelectionMuted = selectedFocusActive && !selectedFocusEdgeIds.has(edge.id);
        this.drawEdgeLane(ctx, edge.id, from, to, laneOffsetPx, isHighlighted, isGlowing, isDashed, isDimmed, isSelectionMuted);
      });
    });

    const sizeScale = this.getSizeScale();
    const pulseIds = this.pulseNodeIds ?? new Set<string>();
    const pulseTime = this.isBrowser ? performance.now() : 0;
    nodes.forEach((node) => {
      const position = this.project(node);
      const degree = edgeCounts.get(node.id) ?? 0;
      const baseRadius = Math.min(
        NODE_RADIUS_MAX * sizeScale,
        (NODE_RADIUS + degree * NODE_RADIUS_STEP) * sizeScale
      );
      const isSelected = this.selectedNodeId === node.id;
      const isEndpointPinned = this.endpointNodeIds?.has(node.id) ?? false;
      const isRouteEndpoint =
        this.selectedConnection !== null &&
        (node.id === this.selectedConnection.from || node.id === this.selectedConnection.to);
      const isEndpoint = isEndpointPinned || isRouteEndpoint;
      const isHighlighted = selectedFocusActive
        ? isSelected || isEndpoint
        : nodeHighlights.has(node.id) || isSelected || isEndpoint;
      const isHovered = this.hoveredNodeId === node.id;
      const isPulsing = pulseIds.has(node.id);
      const isDimmed = routingActive && !isHighlighted && !isHovered && !isPulsing;
      const shouldEmphasize = isHighlighted || (!selectedFocusActive && isHovered);
      const radius = baseRadius + (shouldEmphasize ? 2 * sizeScale : 0);
      const showShadow = this.pickMode !== null;
      const isSelectionMuted = selectedFocusActive && !isSelected && !isPulsing && !isEndpoint;
      const fillColor = isPulsing
        ? NODE_COLOR_DEFAULT
        : isSelectionMuted
          ? NODE_COLOR_MUTED
          : node.foreign
            ? NODE_COLOR_FOREIGN
            : NODE_COLOR_DEFAULT;
      const strokeColor = isPulsing ? '#ffffff' : isSelectionMuted ? NODE_COLOR_MUTED : '#ffffff';
      const nodeAlpha = isPulsing ? 1 : isDimmed || isSelectionMuted ? DIM_ALPHA : 1;
      if (showShadow) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 5 * sizeScale;
        ctx.shadowOffsetY = 5 * sizeScale;
        ctx.globalAlpha = nodeAlpha;
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = nodeAlpha;
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      if (isEndpoint) {
        const ringRadius = radius + 6 * sizeScale;
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(position.x, position.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.25;
        ctx.stroke();
        ctx.restore();
      }

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius + 4 * sizeScale, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (isPulsing) {
        const pulse = 0.5 + 0.5 * Math.sin(pulseTime / 140);
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius + 8 * sizeScale + pulse * 4 * sizeScale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      this.screenNodes.set(node.id, { x: position.x, y: position.y, r: radius });
    });

    const simulationDotCount = this.drawTripSimulationDots(ctx, pulseTime, sizeScale);

    if (!(this.showConnectionDetailsOnMap && this.selectedConnection)) {
      const labeledNames = new Set(['Bern', 'Zürich', 'Bellinzona', 'Chur', 'Genève']);
      const labelNodes =
        this.interactiveViewport && this.viewportZoom >= 1.8
          ? nodes
          : nodes.filter((node) => labeledNames.has(node.name));
      labelNodes.forEach((node) => {
        const screen = this.screenNodes.get(node.id);
        if (!screen) {
          return;
        }
        ctx.save();
        ctx.font = '12px "ABC Favorit", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const text = node.name;
        const size = measureLabel(ctx, text);
        const x = screen.x + 10;
        const y = screen.y - size.h - 8;
        const isActive = this.hoveredNodeId === node.id || this.selectedNodeId === node.id;
        if (isActive) {
          drawLabelBox(ctx, text, x, y, size.w, size.h, '#ffffff', '#000000');
        } else {
          drawLabel(ctx, text, x, y, size.w, size.h, '#ffffff');
        }
        this.screenNodeLabels.set(node.id, { x, y, w: size.w, h: size.h });
        ctx.restore();
      });
    }

    if (this.showConnectionDetailsOnMap && this.selectedConnection) {
      this.drawConnectionDetails(ctx, this.selectedConnection);
    }

    if (this.hoveredNodeId) {
      const node = this.screenNodes.get(this.hoveredNodeId);
      const data = nodeMap.get(this.hoveredNodeId);
      if (node && data?.name) {
        ctx.save();
        ctx.font = '12px "ABC Favorit", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const text = data.name;
        const size = measureLabel(ctx, text);
        const x = node.x + 10;
        const y = node.y - size.h - 8;
        drawLabelBox(ctx, text, x, y, size.w, size.h, '#ffffff', '#000000');
        this.screenNodeLabels.set(this.hoveredNodeId, { x, y, w: size.w, h: size.h });
        ctx.restore();
      }
    }

    if (this.selectedNodeId && this.selectedNodeId !== this.hoveredNodeId) {
      const node = this.screenNodes.get(this.selectedNodeId);
      const data = nodeMap.get(this.selectedNodeId);
      if (node && data?.name) {
        ctx.save();
        ctx.font = '12px "ABC Favorit", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const text = data.name;
        const size = measureLabel(ctx, text);
        const x = node.x + 10;
        const y = node.y - size.h - 8;
        drawLabelBox(ctx, text, x, y, size.w, size.h, '#ffffff', '#000000');
        this.screenNodeLabels.set(this.selectedNodeId, { x, y, w: size.w, h: size.h });
        ctx.restore();
      }
    }

    pulseIds.forEach((nodeId) => {
      if (nodeId === this.hoveredNodeId || nodeId === this.selectedNodeId) {
        return;
      }
      const node = this.screenNodes.get(nodeId);
      const data = nodeMap.get(nodeId);
      if (!node || !data?.name) {
        return;
      }
      ctx.save();
      ctx.font = '12px "ABC Favorit", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const text = data.name;
      const size = measureLabel(ctx, text);
      const x = node.x + 10;
      const y = node.y - size.h - 8;
      drawLabelBox(ctx, text, x, y, size.w, size.h, '#ffffff', '#000000');
      this.screenNodeLabels.set(nodeId, { x, y, w: size.w, h: size.h });
      ctx.restore();
    });

    if (pulseIds.size > 0 || simulationDotCount > 0) {
      this.scheduleRender();
    }
  }

  private project(node: GraphNode): { x: number; y: number } {
    return worldToScreen(node, this.transform);
  }

  getMapTransform(): string {
    const tx = this.viewportPan.x;
    const ty = this.viewportPan.y;
    return `translate(${tx}px, ${ty}px) scale(${this.viewportZoom})`;
  }

  private getScreenPoint(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private resetViewport(): void {
    this.viewportZoom = DEFAULT_INITIAL_VIEWPORT_ZOOM;
    this.viewportPan = this.getDefaultViewportPan(DEFAULT_INITIAL_VIEWPORT_ZOOM);
    this.viewportTouched = false;
    this.viewportMode = 'default';
  }

  private zoomByFactor(factor: number): void {
    if (!this.isBrowser || !this.interactiveViewport || this.pickMode !== null) {
      return;
    }
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / 2;
    const sy = rect.height / 2;
    const nextZoom = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, this.viewportZoom * factor));
    this.applyZoom(nextZoom, sx, sy);
  }

  private applyZoom(nextZoom: number, sx: number, sy: number): void {
    if (Math.abs(nextZoom - this.viewportZoom) < 0.0001) {
      return;
    }
    const world = screenToWorld({ x: sx, y: sy }, this.transform);
    this.viewportZoom = nextZoom;
    this.viewportPan = {
      x: sx - (world.x * this.fitTransform.scale + this.fitTransform.offsetX) * this.viewportZoom,
      y: sy - (world.y * this.fitTransform.scale + this.fitTransform.offsetY) * this.viewportZoom
    };
    this.viewportTouched = true;
    this.viewportMode = 'manual';
    this.scheduleRender();
  }

  private createPinchStart():
    | {
        distance: number;
        zoom: number;
        world: { x: number; y: number };
      }
    | null {
    const pair = this.getActivePointerPair();
    if (!pair) {
      return null;
    }
    const midpoint = {
      x: (pair[0].x + pair[1].x) / 2,
      y: (pair[0].y + pair[1].y) / 2
    };
    return {
      distance: Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y)),
      zoom: this.viewportZoom,
      world: screenToWorld(midpoint, this.transform)
    };
  }

  private updatePinchViewport(): void {
    const pair = this.getActivePointerPair();
    if (!pair) {
      this.pinchStart = null;
      return;
    }
    if (!this.pinchStart) {
      this.pinchStart = this.createPinchStart();
      if (!this.pinchStart) {
        return;
      }
    }
    const midpoint = {
      x: (pair[0].x + pair[1].x) / 2,
      y: (pair[0].y + pair[1].y) / 2
    };
    const distance = Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
    const nextZoom = Math.max(
      MIN_VIEWPORT_ZOOM,
      Math.min(MAX_VIEWPORT_ZOOM, this.pinchStart.zoom * (distance / this.pinchStart.distance))
    );

    this.viewportZoom = nextZoom;
    this.viewportPan = {
      x: midpoint.x - (this.pinchStart.world.x * this.fitTransform.scale + this.fitTransform.offsetX) * nextZoom,
      y: midpoint.y - (this.pinchStart.world.y * this.fitTransform.scale + this.fitTransform.offsetY) * nextZoom
    };
    this.viewportTouched = true;
    this.viewportMode = 'manual';
    this.scheduleRender();
  }

  private getActivePointerPair(): [{ x: number; y: number }, { x: number; y: number }] | null {
    if (this.activePointers.size < 2) {
      return null;
    }
    const values = [...this.activePointers.values()];
    return [values[0], values[1]];
  }

  private fitViewportToConnection(connection: ConnectionOption, nodes: GraphNode[]): boolean {
    if (!nodes.length || this.canvasSize.width <= 1 || this.canvasSize.height <= 1) {
      return false;
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const routeNodeIds = new Set<string>([connection.from, connection.to]);
    connection.legs.forEach((leg) => {
      routeNodeIds.add(leg.from);
      routeNodeIds.add(leg.to);
    });

    const routeNodes: GraphNode[] = [];
    routeNodeIds.forEach((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node) {
        routeNodes.push(node);
      }
    });
    if (!routeNodes.length) {
      return false;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    routeNodes.forEach((node) => {
      const x = node.x * this.fitTransform.scale + this.fitTransform.offsetX;
      const y = node.y * this.fitTransform.scale + this.fitTransform.offsetY;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const padding = Math.max(
      ROUTE_FIT_PADDING_MIN,
      Math.min(ROUTE_FIT_PADDING_MAX, Math.min(this.canvasSize.width, this.canvasSize.height) * 0.12)
    );
    const clampedTopInset = Math.max(0, Math.min(this.routeFitTopInset, this.canvasSize.height * 0.45));
    const leftPadding = padding;
    const rightPadding = padding;
    const topPadding = padding + clampedTopInset;
    const bottomPadding = padding;
    const availableWidth = Math.max(40, this.canvasSize.width - leftPadding - rightPadding);
    const availableHeight = Math.max(40, this.canvasSize.height - topPadding - bottomPadding);
    const zoomX = availableWidth / boundsWidth;
    const zoomY = availableHeight / boundsHeight;
    const nextZoom = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, Math.min(zoomX, zoomY)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const targetCenterX = leftPadding + availableWidth / 2;
    const targetCenterY = topPadding + availableHeight / 2;
    this.viewportZoom = nextZoom;
    this.viewportPan = {
      x: targetCenterX - centerX * nextZoom,
      y: targetCenterY - centerY * nextZoom
    };
    this.viewportTouched = true;
    this.viewportMode = 'connection';
    return true;
  }

  private focusViewportOnNode(nodeId: string): boolean {
    const nodes = this.graph?.nodes;
    if (!nodes?.length || this.canvasSize.width <= 1 || this.canvasSize.height <= 1) {
      return false;
    }
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return false;
    }

    const nextZoom = this.getSelectedNodeFocusZoom();
    const screenX = node.x * this.fitTransform.scale + this.fitTransform.offsetX;
    const screenY = node.y * this.fitTransform.scale + this.fitTransform.offsetY;
    const topInset = Math.max(0, Math.min(this.viewportFocusTopInset, this.canvasSize.height * 0.35));
    const bottomInset = Math.max(0, Math.min(this.viewportFocusBottomInset, this.canvasSize.height * 0.75));
    const visibleWidth = this.canvasSize.width;
    const visibleHeight = Math.max(40, this.canvasSize.height - topInset - bottomInset);
    const targetCenterX = visibleWidth / 2;
    const targetCenterY = topInset + visibleHeight / 2;

    this.viewportZoom = nextZoom;
    this.viewportPan = {
      x: targetCenterX - screenX * nextZoom,
      y: targetCenterY - screenY * nextZoom
    };
    this.viewportTouched = true;
    this.viewportMode = 'selected-node';
    return true;
  }

  private getSelectedNodeFocusZoom(): number {
    const compactFocus =
      this.canvasSize.width < 1024 || this.viewportFocusTopInset > 0 || this.viewportFocusBottomInset > 0;
    const targetZoom = compactFocus ? SELECTED_NODE_FOCUS_ZOOM_COMPACT : SELECTED_NODE_FOCUS_ZOOM_DESKTOP;
    return Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, targetZoom));
  }

  private getDefaultViewportPan(zoom: number): { x: number; y: number } {
    const { width, height } = this.canvasSize;
    if (width <= 1 || height <= 1) {
      return { x: 0, y: 0 };
    }
    const defaultNode = this.getDefaultViewportNode();
    if (!defaultNode) {
      return { x: 0, y: 0 };
    }
    const fitTransform = computeTransform(width, height, DEFAULT_VIEWBOX);
    const screenX = defaultNode.x * fitTransform.scale * zoom + fitTransform.offsetX * zoom;
    const screenY = defaultNode.y * fitTransform.scale * zoom + fitTransform.offsetY * zoom;
    return {
      x: width / 2 - screenX,
      y: height / 2 + DEFAULT_INITIAL_VIEWPORT_OFFSET_Y - screenY
    };
  }

  private getDefaultViewportNode(): GraphNode | null {
    const nodes = this.graph?.nodes;
    if (!nodes?.length) {
      return null;
    }
    return nodes.find((node) => node.name === 'Luzern') ?? nodes.find((node) => node.id === 'luzern') ?? null;
  }

  private getHighlightIds(): { nodeIds: Set<string>; edgeIds: Set<string> } {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const detail = this.nodeDetail;

    if (detail?.node) {
      nodeIds.add(detail.node.id);
    }
    detail?.neighbors.forEach((neighbor) => nodeIds.add(neighbor.id));
    detail?.edges.forEach((edge) => edgeIds.add(edge.id));

    return { nodeIds, edgeIds };
  }

  private getSelectedNodeEdgeIds(edges: GraphSnapshot['edges']): Set<string> {
    const selected = this.selectedNodeId;
    if (!selected) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    edges.forEach((edge) => {
      if (edge.from === selected || edge.to === selected) {
        ids.add(edge.id);
      }
    });
    return ids;
  }

  private getTopConnectedNodes(nodes: GraphNode[], edgeCounts: Map<string, number>, limit: number): GraphNode[] {
    return [...nodes]
      .sort((a, b) => {
        const countDiff = (edgeCounts.get(b.id) ?? 0) - (edgeCounts.get(a.id) ?? 0);
        if (countDiff !== 0) {
          return countDiff;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  }

  private transportLabel(transport: string): string {
    const key = `transport.${transport}`;
    const label = this.transloco.translate(key);
    return label === key ? transport : label;
  }

  private hitTestNode(event: MouseEvent): string | null {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (const [id, node] of this.screenNodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= node.r * node.r) {
        return id;
      }
    }

    for (const [id, label] of this.screenNodeLabels) {
      if (x >= label.x && x <= label.x + label.w && y >= label.y && y <= label.y + label.h) {
        return id;
      }
    }

    return null;
  }

  private drawEdgeLane(
    ctx: CanvasRenderingContext2D,
    edgeId: string,
    from: GraphNode,
    to: GraphNode,
    laneOffsetPx: number,
    isHighlighted: boolean,
    isGlowing: boolean,
    isDashed: boolean,
    isDimmed: boolean,
    isSelectionMuted: boolean
  ): void {
    const fromPos = this.project(from);
    const toPos = this.project(to);
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      return;
    }
    const px = -dy / len;
    const py = dx / len;
    const pickDim = this.pickMode !== null;
    const baseStroke = pickDim ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.48)';
    const dimStroke = pickDim ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.14)';
    const strokeStyle = isHighlighted ? '#ffffff' : isSelectionMuted ? NODE_COLOR_MUTED : isDimmed ? dimStroke : baseStroke;
    const x1 = fromPos.x + px * laneOffsetPx;
    const y1 = fromPos.y + py * laneOffsetPx;
    const x2 = toPos.x + px * laneOffsetPx;
    const y2 = toPos.y + py * laneOffsetPx;
    this.screenEdges.set(edgeId, { x1, y1, x2, y2 });
    const dashPattern = isDashed ? [10, 7] : [];
    if (isGlowing) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = EDGE_LINE_WIDTH_HIGHLIGHT + 5;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 14;
      ctx.setLineDash(dashPattern);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = isSelectionMuted ? DIM_ALPHA : 1;
    ctx.strokeStyle = isGlowing ? '#ffffff' : strokeStyle;
    ctx.lineWidth = isGlowing ? EDGE_LINE_WIDTH_HIGHLIGHT + 1 : isHighlighted ? EDGE_LINE_WIDTH_HIGHLIGHT : EDGE_LINE_WIDTH;
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  private getUncertainRouteEdgeIds(): Set<string> {
    const ids = new Set<string>();
    const selected = this.selectedConnection;
    if (!selected) {
      return ids;
    }
    selected.legs.forEach((leg) => {
      if (leg.continuationOutsideDataset || leg.foreignStartPreface || !leg.departs || !leg.arrives) {
        ids.add(leg.edgeId);
      }
    });
    return ids;
  }

  private buildPointerPayload(event: PointerEvent): {
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
    hitSimulationTrip: MapSimulationTripHit | null;
  } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return {
        screen: { x: 0, y: 0 },
        world: { x: 0, y: 0 },
        hitNodeId: null,
        hitEdgeId: null,
        hitSimulationTrip: null
      };
    }

    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const world = {
      x: (screen.x - this.transform.offsetX) / this.transform.scale,
      y: (screen.y - this.transform.offsetY) / this.transform.scale
    };
    const hitNodeId = this.hitTestNode(event);
    const hitSimulationTrip = hitNodeId ? null : this.hitTestSimulationDot(screen.x, screen.y);
    const hitEdgeId = hitNodeId || hitSimulationTrip ? null : this.hitTestEdge(screen.x, screen.y);

    return { screen, world, hitNodeId, hitEdgeId, hitSimulationTrip };
  }

  private updateHoverState(hitNodeId: string | null): void {
    if (this.hoveredNodeId === hitNodeId) {
      return;
    }
    this.hoveredNodeId = hitNodeId;
    this.scheduleRender();
  }

  private hitTestEdge(x: number, y: number): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;
    const threshold = 6;

    for (const [id, edge] of this.screenEdges) {
      const dist = distanceToSegment(x, y, edge.x1, edge.y1, edge.x2, edge.y2);
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    return bestId;
  }

  private hitTestSimulationDot(x: number, y: number): MapSimulationTripHit | null {
    let best:
      | {
          dot: { x: number; y: number; r: number; run: SimTripRun; progress: number };
          dist: number;
        }
      | null = null;
    const threshold = 9;
    for (const dot of this.screenSimulationDots) {
      const dx = x - dot.x;
      const dy = y - dot.y;
      const dist = Math.hypot(dx, dy);
      if (dist > Math.max(threshold, dot.r + 4)) {
        continue;
      }
      if (!best || dist < best.dist) {
        best = { dot, dist };
      }
    }
    if (!best) {
      return null;
    }
    const run = best.dot.run;
    return {
      edgeId: run.edgeId,
      tripId: run.tripId,
      fromId: run.fromId,
      toId: run.toId,
      transport: run.transport,
      departs: run.departs,
      arrives: run.arrives,
      arrivalDayOffset: run.arrivalDayOffset,
      progress: best.dot.progress,
      dotX: best.dot.x,
      dotY: best.dot.y
    };
  }

  private drawConnectionDetails(ctx: CanvasRenderingContext2D, connection: ConnectionOption): void {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const maxLabels = 12;
    const waitSegments = buildWaitSegments(connection);

    const labels: Array<{
      text: string;
      anchor: { x: number; y: number };
      priority: number;
      kind: 'leg' | 'wait' | 'endpoint';
      overnightDelta?: number;
    }> = [];

    const legLabels = connection.legs
      .map((leg) => {
        if (leg.continuationOutsideDataset || leg.foreignStartPreface || !leg.departs || !leg.arrives) {
          return null;
        }
        const from = this.screenNodes.get(leg.from);
        const to = this.screenNodes.get(leg.to);
        if (!from || !to) {
          return null;
        }
        const anchor = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const depart = getLegAbsTime(leg, 'depart');
        const arrive = getLegAbsTime(leg, 'arrive');
        const dayDelta = Math.max(0, arrive.dayOffset - depart.dayOffset);
        const suffix = dayDelta > 0 ? ` (+${dayDelta})` : '';
        const transportLabel = this.transportLabel(leg.transport);
        const text = `${transportLabel} ${leg.departs}→${leg.arrives}${suffix}`;
        return { text, anchor, priority: 3, kind: 'leg' };
      })
      .filter(
        (label): label is { text: string; anchor: { x: number; y: number }; priority: number; kind: 'leg' } =>
          Boolean(label)
      );

    const waitLabels = waitSegments.map((segment) => {
      const node = this.screenNodes.get(segment.atNodeId);
      if (!node) {
        return null;
      }
      const duration = formatDuration(segment.durationMinutes);
      const delta = segment.overnight ? Math.max(0, segment.endDayOffset - segment.startDayOffset) : 0;
      const text = `${duration}`;
      return {
        text,
        anchor: { x: node.x, y: node.y },
        priority: segment.overnight ? 1 : 2,
        kind: 'wait',
        overnightDelta: delta > 0 ? delta : undefined
      };
    });

    labels.push(...(waitLabels.filter(Boolean) as Array<typeof labels[number]>), ...legLabels);

    const startNode = this.screenNodes.get(connection.from);
    if (startNode && connection.departs) {
      labels.push({
        text: `${this.getNodeLabel(connection.from)} ${connection.departs}`,
        anchor: { x: startNode.x, y: startNode.y },
        priority: 0,
        kind: 'endpoint'
      });
    }
    const endNode = this.screenNodes.get(connection.to);
    if (endNode && connection.arrives) {
      const arriveSuffix =
        connection.arriveDayOffset && connection.arriveDayOffset > 0 ? ` (+${connection.arriveDayOffset})` : '';
      labels.push({
        text: `${this.getNodeLabel(connection.to)} ${connection.arrives}${arriveSuffix}`,
        anchor: { x: endNode.x, y: endNode.y },
        priority: 0,
        kind: 'endpoint'
      });
    }

    labels.sort((a, b) => a.priority - b.priority);

    ctx.save();
    ctx.font = '12px "ABC Favorit", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    let rendered = 0;
    for (const label of labels) {
      if (rendered >= maxLabels) {
        break;
      }
      const size =
        label.kind === 'wait'
          ? measureWaitLabel(ctx, label.text, label.overnightDelta)
          : measureLabel(ctx, label.text);
      const position = placeLabel(
        placed,
        label.anchor.x,
        label.anchor.y,
        size.w,
        size.h,
        label.kind === 'wait' ? 28 : 18
      );
      if (!position) {
        continue;
      }
      if (label.kind === 'wait') {
        drawWaitLabel(ctx, label.text, position.x, position.y, size.w, size.h, label.overnightDelta);
      } else if (label.kind === 'endpoint') {
        drawLabel(ctx, label.text, position.x, position.y, size.w, size.h, '#ffffff');
      } else {
        drawLabel(ctx, label.text, position.x, position.y, size.w, size.h);
      }
      placed.push({ x: position.x, y: position.y, w: size.w, h: size.h });
      rendered += 1;
    }

    ctx.restore();
  }

  private getSizeScale(): number {
    const minDim = Math.min(this.canvasSize.width, this.canvasSize.height);
    if (!minDim) {
      return 1;
    }
    const scale = minDim / 800;
    const viewportScale = Math.max(0.5, Math.min(1.5, this.viewportZoom));
    return Math.max(0.36, Math.min(1.4, scale * viewportScale));
  }

  private rebuildTripSimulationCache(): void {
    this.tripRunsByMinute = Array.from({ length: MINUTES_PER_DAY }, () => []);
    const graph = this.graph;
    if (!graph) {
      return;
    }
    for (const edge of graph.edges) {
      for (const trip of edge.trips ?? []) {
        if (!trip.departs || !trip.arrives) {
          continue;
        }
        const departMinute = parseHHMM(trip.departs);
        const arriveMinuteRaw = parseHHMM(trip.arrives);
        if (departMinute === null || arriveMinuteRaw === null) {
          continue;
        }
        const providedOffset = typeof trip.arrivalDayOffset === 'number' ? trip.arrivalDayOffset : 0;
        let arriveMinute = arriveMinuteRaw + providedOffset * MINUTES_PER_DAY;
        if (arriveMinute <= departMinute) {
          arriveMinute += MINUTES_PER_DAY;
        }
        const durationMinutes = arriveMinute - departMinute;
        if (!(durationMinutes > 0)) {
          continue;
        }
        const run: SimTripRun = {
          edgeId: edge.id,
          tripId: trip.id,
          fromId: edge.from,
          toId: edge.to,
          transport: trip.transport,
          departs: trip.departs,
          arrives: trip.arrives,
          arrivalDayOffset: trip.arrivalDayOffset,
          departMinute,
          arriveMinute,
          durationMinutes
        };
        this.addTripRunToBuckets(run);
      }
    }
  }

  private addTripRunToBuckets(run: SimTripRun): void {
    if (run.durationMinutes >= MINUTES_PER_DAY) {
      for (let minute = 0; minute < MINUTES_PER_DAY; minute += 1) {
        this.tripRunsByMinute[minute].push(run);
      }
      return;
    }
    const start = Math.floor(run.departMinute);
    const end = Math.floor(run.arriveMinute);
    if (end < MINUTES_PER_DAY) {
      for (let minute = start; minute <= end; minute += 1) {
        this.tripRunsByMinute[minute].push(run);
      }
      return;
    }
    for (let minute = start; minute < MINUTES_PER_DAY; minute += 1) {
      this.tripRunsByMinute[minute].push(run);
    }
    const wrappedEnd = end % MINUTES_PER_DAY;
    for (let minute = 0; minute <= wrappedEnd; minute += 1) {
      this.tripRunsByMinute[minute].push(run);
    }
  }

  private drawTripSimulationDots(ctx: CanvasRenderingContext2D, pulseTime: number, sizeScale: number): number {
    if (this.routingActive || this.tripSimulationMinute === null) {
      return 0;
    }
    const minute = normalizeMinute(this.tripSimulationMinute);
    const minuteBucket = this.tripRunsByMinute[Math.floor(minute)];
    if (!minuteBucket?.length) {
      return 0;
    }

    const dotRadius = Math.max(1.2, 1.9 * sizeScale);
    let drawn = 0;
    ctx.save();
    for (const run of minuteBucket) {
      const edge = this.screenEdges.get(run.edgeId);
      if (!edge) {
        continue;
      }
      const progress = this.getTripRunProgress(run, minute);
      if (progress === null) {
        continue;
      }
      const x = edge.x1 + (edge.x2 - edge.x1) * progress;
      const y = edge.y1 + (edge.y2 - edge.y1) * progress;
      const phase = pulseTime / 160 + ((x + y) % 17);
      const pulse = 0.5 + 0.5 * Math.sin(phase);
      const outerRadius = dotRadius + 1.4 * sizeScale + pulse * 1.2 * sizeScale;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      this.screenSimulationDots.push({
        x,
        y,
        r: outerRadius,
        run,
        progress
      });
      drawn += 1;
      if (drawn >= MAX_SIMULATION_DOTS) {
        break;
      }
    }
    ctx.restore();
    return drawn;
  }

  private getTripRunProgress(run: SimTripRun, minute: number): number | null {
    let absoluteMinute = minute;
    while (absoluteMinute < run.departMinute) {
      absoluteMinute += MINUTES_PER_DAY;
    }
    if (absoluteMinute < run.departMinute || absoluteMinute > run.arriveMinute) {
      return null;
    }
    return Math.max(0, Math.min(1, (absoluteMinute - run.departMinute) / run.durationMinutes));
  }

  private getNodeLabel(id: string): string {
    const nodes = this.graph?.nodes ?? [];
    return nodes.find((node) => node.id === id)?.name ?? id;
  }
}

function normalizeMinute(value: number): number {
  return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function parseHHMM(value: string): number | null {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function measureLabel(ctx: CanvasRenderingContext2D, text: string): { w: number; h: number } {
  const metrics = ctx.measureText(text);
  const paddingX = 8;
  const paddingY = 6;
  const textHeight = 12;
  return {
    w: Math.ceil(metrics.width) + paddingX * 2,
    h: textHeight + paddingY * 2
  };
}

function measureWaitLabel(ctx: CanvasRenderingContext2D, text: string, overnightDelta?: number): { w: number; h: number } {
  const metrics = ctx.measureText(text);
  const paddingX = 8;
  const paddingY = 6;
  const textHeight = 12;
  const iconSize = 12;
  const gap = 6;
  const overnightWidth = overnightDelta !== undefined ? iconSize + gap + ctx.measureText(`+${overnightDelta}`).width : 0;
  return {
    w: Math.ceil(metrics.width) + paddingX * 2 + iconSize + gap + overnightWidth,
    h: textHeight + paddingY * 2
  };
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  textColor = '#ffffff'
): void {
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.fillText(text, x + 8, y + h / 2 + 0.5);
  ctx.restore();
}

function drawLabelBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor = '#ffffff',
  textColor = '#141414'
): void {
  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.fillText(text, x + 8, y + h / 2);
  ctx.restore();
}

const WAIT_ICON_PATH_DATA =
  'M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z';
let waitIconPath: Path2D | null = null;

const OVERNIGHT_ICON_PATH_DATA =
  'M303.3 112.7C196.2 121.2 112 210.8 112 320C112 434.9 205.1 528 320 528C353.3 528 384.7 520.2 412.6 506.3C309.2 482.9 232 390.5 232 280C232 214.2 259.4 154.9 303.3 112.7zM64 320C64 178.6 178.6 64 320 64C339.4 64 358.4 66.2 376.7 70.3C386.6 72.5 394 80.8 395.2 90.8C396.4 100.8 391.2 110.6 382.1 115.2C321.5 145.4 280 207.9 280 280C280 381.6 362.4 464 464 464C469 464 473.9 463.8 478.8 463.4C488.9 462.6 498.4 468.2 502.6 477.5C506.8 486.8 504.6 497.6 497.3 504.6C451.3 548.8 388.8 576 320 576C178.6 576 64 461.4 64 320z';
let overnightIconPath: Path2D | null = null;

function drawWaitLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  overnightDelta?: number
): void {
  const iconSize = 12;
  const gap = 6;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.stroke();

  const iconX = x + 8;
  const iconY = y + h / 2 - iconSize / 2;
  if (typeof Path2D !== 'undefined') {
    if (!waitIconPath) {
      waitIconPath = new Path2D(WAIT_ICON_PATH_DATA);
    }
    const scale = iconSize / 640;
    ctx.save();
    ctx.translate(iconX, iconY);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fill(waitIconPath);
    ctx.restore();
  } else {
    // SSR-safe fallback: draw a simple clock
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(iconX + iconSize / 2, iconY + iconSize / 2);
    ctx.lineTo(iconX + iconSize / 2, iconY + iconSize * 0.25);
    ctx.moveTo(iconX + iconSize / 2, iconY + iconSize / 2);
    ctx.lineTo(iconX + iconSize * 0.75, iconY + iconSize / 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  let textX = x + 8 + iconSize + gap;
  ctx.fillText(text, textX, y + h / 2);

  if (overnightDelta !== undefined) {
    const suffix = `+${overnightDelta}`;
    const suffixWidth = ctx.measureText(suffix).width;
    const overnightX = textX + ctx.measureText(text).width + gap;
    if (typeof Path2D !== 'undefined') {
      if (!overnightIconPath) {
        overnightIconPath = new Path2D(OVERNIGHT_ICON_PATH_DATA);
      }
      const scale = iconSize / 640;
      ctx.save();
      ctx.translate(overnightX, iconY);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fill(overnightIconPath);
      ctx.restore();
      ctx.fillText(suffix, overnightX + iconSize + gap, y + h / 2);
    } else {
      // Fallback: just draw "+N"
      ctx.fillText(suffix, overnightX + gap, y + h / 2);
    }
    // avoid unused variable linting
    void suffixWidth;
  }
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function placeLabel(
  placed: Array<{ x: number; y: number; w: number; h: number }>,
  anchorX: number,
  anchorY: number,
  w: number,
  h: number,
  baseDistance = 18
): { x: number; y: number } | null {
  const d = baseDistance;
  const offsets = [
    { x: 0, y: -d },
    { x: d, y: 0 },
    { x: 0, y: d },
    { x: -d, y: 0 },
    { x: d, y: -d },
    { x: -d, y: -d },
    { x: d, y: d },
    { x: -d, y: d }
  ];

  for (const offset of offsets) {
    const x = anchorX + offset.x - w / 2;
    const y = anchorY + offset.y - h / 2;
    const box = { x, y, w, h };
    if (!placed.some((existing) => boxesIntersect(existing, box))) {
      return { x, y };
    }
  }

  return null;
}

function boxesIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function formatDuration(totalMinutes: number): string {
  const normalized = Math.max(0, totalMinutes);
  const days = Math.floor(normalized / 1440);
  const hours = Math.floor((normalized % 1440) / 60);
  const minutes = normalized % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = x1 + clamped * dx;
  const projY = y1 + clamped * dy;
  return Math.hypot(px - projX, py - projY);
}
