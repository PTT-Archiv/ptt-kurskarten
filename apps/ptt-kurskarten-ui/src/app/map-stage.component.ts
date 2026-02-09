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
import type { ConnectionOption, GraphNode, GraphSnapshot, NodeDetail } from '@ptt-kurskarten/shared';
import { computeTransform, DEFAULT_VIEWBOX, worldToScreen } from './map-coordinates';
import { buildWaitSegments, getLegAbsTime } from './connection-details.util';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

const NODE_RADIUS = 5;
const NODE_RADIUS_MAX = 20;
const NODE_RADIUS_STEP = 1;
const EDGE_LINE_WIDTH = 1;
const EDGE_LINE_WIDTH_HIGHLIGHT = 2;
const EDGE_LANE_SPACING = 6;
const NODE_COLOR_DEFAULT = '#ffff00';
const NODE_COLOR_FOREIGN = '#0000ff';

@Component({
  selector: 'app-map-stage',
  standalone: true,
  template: `
    <div class="stage" [class.no-border]="!showBorder">
      <img class="map map-shadow" src="assets/maps/switzerland.svg" alt="" />
      <img class="map" src="assets/maps/switzerland.svg" alt="Switzerland map" />
      <div class="overlay">
        <canvas
          #graphCanvas
          class="graph-canvas"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointerleave)="onPointerLeave()"
        ></canvas>
      </div>
    </div>
  `,
  styles: [
    `
      :host(.pick-mode) .map {
        opacity: 0.45;
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
        background: var(--ptt-white);
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
      }

      .map-shadow {
        position: absolute;
        inset: 0;
        transform: translate(6px, 6px);
        opacity: 0.35;
        filter: grayscale(1) brightness(0.2);
        z-index: 0;
      }

      .map:not(.map-shadow) {
        position: relative;
        z-index: 1;
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
      }
    `
  ]
})
export class MapStageComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) graph: GraphSnapshot | null = null;
  @Input() nodeDetail: NodeDetail | null = null;
  @Input() highlightedEdgeIds: Set<string> | null = null;
  @Input() highlightedNodeIds: Set<string> | null = null;
  @Input() pulseNodeIds: Set<string> | null = null;
  @Input() pickMode: 'from' | 'to' | null = null;
  @Input() selectedConnection: ConnectionOption | null = null;
  @Input() showConnectionDetailsOnMap = true;
  @Input() selectedNodeId: string | null = null;
  @Input() routingActive = false;
  @Input() showBorder = true;
  @Output() nodeSelected = new EventEmitter<string | null>();
  @Output() mapPointer = new EventEmitter<{
    type: 'down' | 'move' | 'up';
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
  }>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transloco = inject(TranslocoService);

  @HostBinding('class.pick-mode') get pickModeClass(): boolean {
    return this.pickMode !== null;
  }

  @ViewChild('graphCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private rafId: number | null = null;
  private resizeObserver?: ResizeObserver;
  private screenNodes = new Map<string, { x: number; y: number; r: number }>();
  private screenEdges = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  private canvasSize = { width: 0, height: 0 };
  private pendingCanvasSize: { width: number; height: number } | null = null;
  private resizeRafId: number | null = null;
  private transform = computeTransform(1, 1, DEFAULT_VIEWBOX);
  private needsRender = false;
  private activePointerId: number | null = null;
  private langSub?: Subscription;
  private hoveredNodeId: string | null = null;

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
      changes['pickMode'] ||
      changes['selectedConnection'] ||
      changes['showConnectionDetailsOnMap'] ||
      changes['selectedNodeId'] ||
      changes['routingActive']
    ) {
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

    this.activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);

    const payload = this.buildPointerPayload(event);
    this.mapPointer.emit({ ...payload, type: 'down' });
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isBrowser) {
      return;
    }

    const payload = this.buildPointerPayload(event);
    if (this.activePointerId === event.pointerId) {
      this.mapPointer.emit({ ...payload, type: 'move' });
    }
    this.updateHoverState(payload.hitNodeId);
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.isBrowser || this.activePointerId !== event.pointerId) {
      return;
    }

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.releasePointerCapture(event.pointerId);
    }
    this.activePointerId = null;

    const payload = this.buildPointerPayload(event);
    this.mapPointer.emit({ ...payload, type: 'up' });

    if (payload.hitNodeId) {
      this.nodeSelected.emit(payload.hitNodeId);
    }
  }

  onPointerLeave(): void {
    if (!this.isBrowser) {
      return;
    }
    this.updateHoverState(null);
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
    this.transform = computeTransform(width, height, DEFAULT_VIEWBOX);

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const highlightIds = this.getHighlightIds();
    const edgeHighlights = this.highlightedEdgeIds ?? highlightIds.edgeIds;
    const nodeHighlights = this.highlightedNodeIds ?? highlightIds.nodeIds;
    const routingActive = this.routingActive;

    this.screenNodes.clear();
    this.screenEdges.clear();

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
        if (a.transport !== b.transport) {
          return a.transport.localeCompare(b.transport);
        }
        if (a.validFrom !== b.validFrom) {
          return a.validFrom - b.validFrom;
        }
        return a.id.localeCompare(b.id);
      });

      const count = group.length;
      const centerLaneIndex = Math.floor((count - 1) / 2);
      group.forEach((edge, index) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) {
          return;
        }
        const laneIndex = index - (count - 1) / 2;
        const laneOffsetPx = laneIndex * EDGE_LANE_SPACING;
        const isHighlighted = edgeHighlights.has(edge.id);
        const isDimmed = routingActive && !isHighlighted;
        this.drawEdgeLane(ctx, edge.id, from, to, laneOffsetPx, isHighlighted, isDimmed);
        if (routingActive && isHighlighted && index === centerLaneIndex) {
          this.drawEdgeChevrons(ctx, from, to, laneOffsetPx);
        }
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
      const isHighlighted = nodeHighlights.has(node.id) || isSelected;
      const isHovered = this.hoveredNodeId === node.id;
      const isDimmed = routingActive && !isHighlighted && !isHovered;
      const radius = baseRadius + (isHighlighted || isHovered ? 2 * sizeScale : 0);
      const showShadow = this.pickMode !== null;
      const fillColor = node.foreign ? NODE_COLOR_FOREIGN : NODE_COLOR_DEFAULT;
      if (showShadow) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 5 * sizeScale;
        ctx.shadowOffsetY = 5 * sizeScale;
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      // Keep nodes at full opacity even when edges are dimmed.
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius + 4 * sizeScale, 0, Math.PI * 2);
        ctx.strokeStyle = '#141414';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (pulseIds.has(node.id)) {
        const pulse = 0.5 + 0.5 * Math.sin(pulseTime / 140);
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius + 8 * sizeScale + pulse * 4 * sizeScale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      this.screenNodes.set(node.id, { x: position.x, y: position.y, r: radius });
    });

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
        drawLabel(ctx, text, x, y, size.w, size.h);
        ctx.restore();
      }
    }

    if (pulseIds.size > 0) {
      this.scheduleRender();
    }
  }

  private project(node: GraphNode): { x: number; y: number } {
    return worldToScreen(node, this.transform);
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

    return null;
  }

  private drawEdgeLane(
    ctx: CanvasRenderingContext2D,
    edgeId: string,
    from: GraphNode,
    to: GraphNode,
    laneOffsetPx: number,
    isHighlighted: boolean,
    isDimmed: boolean
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
    const baseStroke = pickDim ? 'rgba(20, 20, 20, 0.18)' : 'rgba(20, 20, 20, 0.35)';
    const dimStroke = pickDim ? 'rgba(20, 20, 20, 0.08)' : 'rgba(20, 20, 20, 0.12)';
    ctx.strokeStyle = isHighlighted ? '#141414' : isDimmed ? dimStroke : baseStroke;
    ctx.lineWidth = isHighlighted ? EDGE_LINE_WIDTH_HIGHLIGHT : EDGE_LINE_WIDTH;
    const x1 = fromPos.x + px * laneOffsetPx;
    const y1 = fromPos.y + py * laneOffsetPx;
    const x2 = toPos.x + px * laneOffsetPx;
    const y2 = toPos.y + py * laneOffsetPx;
    this.screenEdges.set(edgeId, { x1, y1, x2, y2 });
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private drawEdgeChevrons(ctx: CanvasRenderingContext2D, from: GraphNode, to: GraphNode, laneOffsetPx: number): void {
    const fromPos = this.project(from);
    const toPos = this.project(to);
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const len = Math.hypot(dx, dy);
    if (len < 30) {
      return;
    }

    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;

    const x1 = fromPos.x + px * laneOffsetPx;
    const y1 = fromPos.y + py * laneOffsetPx;
    const x2 = toPos.x + px * laneOffsetPx;
    const y2 = toPos.y + py * laneOffsetPx;

    const positions = len < 120 ? [0.6] : [0.5, 0.7];
    const chevronSize = 5;
    const chevronSpread = 3;

    ctx.save();
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 1.5;

    positions.forEach((t) => {
      const cx = x1 + (x2 - x1) * t;
      const cy = y1 + (y2 - y1) * t;
      const tipX = cx + ux * 2;
      const tipY = cy + uy * 2;
      const leftX = tipX - ux * chevronSize + px * chevronSpread;
      const leftY = tipY - uy * chevronSize + py * chevronSpread;
      const rightX = tipX - ux * chevronSize - px * chevronSpread;
      const rightY = tipY - uy * chevronSize - py * chevronSpread;

      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();
    });

    ctx.restore();
  }

  private buildPointerPayload(event: PointerEvent): {
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
  } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return {
        screen: { x: 0, y: 0 },
        world: { x: 0, y: 0 },
        hitNodeId: null,
        hitEdgeId: null
      };
    }

    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const world = {
      x: (screen.x - this.transform.offsetX) / this.transform.scale,
      y: (screen.y - this.transform.offsetY) / this.transform.scale
    };
    const hitNodeId = this.hitTestNode(event);
    const hitEdgeId = hitNodeId ? null : this.hitTestEdge(screen.x, screen.y);

    return { screen, world, hitNodeId, hitEdgeId };
  }

  private updateHoverState(hitNodeId: string | null): void {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.style.cursor = hitNodeId ? 'pointer' : 'default';
    }
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

  private drawConnectionDetails(ctx: CanvasRenderingContext2D, connection: ConnectionOption): void {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const maxLabels = 12;
    const waitSegments = buildWaitSegments(connection);

    const overnightStops = new Set(
      waitSegments.filter((segment) => segment.overnight).map((segment) => segment.atNodeId)
    );

    if (overnightStops.size > 0) {
      ctx.save();
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 2;
      overnightStops.forEach((nodeId) => {
        const node = this.screenNodes.get(nodeId);
        if (!node) {
          return;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + 6 * this.getSizeScale(), 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    const waitLabel = this.transloco.translate('label.wait');
    const overnightLabel = this.transloco.translate('label.overnight');

    const labels: Array<{
      text: string;
      anchor: { x: number; y: number };
      priority: number;
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
        const text = `${leg.transport} ${leg.departs}→${leg.arrives}${suffix}`;
        return { text, anchor, priority: 3 };
      })
      .filter((label): label is { text: string; anchor: { x: number; y: number }; priority: number } => Boolean(label));

    const waitLabels = waitSegments.map((segment) => {
      const node = this.screenNodes.get(segment.atNodeId);
      if (!node) {
        return null;
      }
      const duration = formatDuration(segment.durationMinutes);
      let text = `${waitLabel} ${duration}`;
      if (segment.overnight) {
        const delta = Math.max(0, segment.endDayOffset - segment.startDayOffset);
        text += delta > 0 ? ` (${overnightLabel} +${delta})` : ` (${overnightLabel})`;
      }
      return {
        text,
        anchor: { x: node.x, y: node.y },
        priority: segment.overnight ? 1 : 2
      };
    });

    labels.push(
      ...waitLabels.filter((label): label is { text: string; anchor: { x: number; y: number }; priority: number } =>
        Boolean(label)
      ),
      ...legLabels
    );

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
      const size = measureLabel(ctx, label.text);
      const position = placeLabel(placed, label.anchor.x, label.anchor.y, size.w, size.h);
      if (!position) {
        continue;
      }
      drawLabel(ctx, label.text, position.x, position.y, size.w, size.h);
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
    return Math.max(0.7, Math.min(1.4, scale));
  }
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

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#141414';
  ctx.fillText(text, x + 8, y + h / 2);
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
  h: number
): { x: number; y: number } | null {
  const offsets = [
    { x: 0, y: -18 },
    { x: 18, y: 0 },
    { x: 0, y: 18 },
    { x: -18, y: 0 },
    { x: 18, y: -18 },
    { x: -18, y: -18 },
    { x: 18, y: 18 },
    { x: -18, y: 18 }
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
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.max(0, totalMinutes % 60);
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
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
