import {
  AfterViewInit,
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
import type { GraphNode, GraphSnapshot, NodeDetail } from '@ptt-kurskarten/shared';
import { computeTransform, DEFAULT_VIEWBOX, worldToScreen } from './map-coordinates';

const NODE_RADIUS = 9;

@Component({
  selector: 'app-map-stage',
  standalone: true,
  template: `
    <div class="stage">
      <img class="map" src="assets/maps/switzerland.svg" alt="Switzerland map" />
      <div class="overlay">
        <canvas
          #graphCanvas
          class="graph-canvas"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
        ></canvas>
      </div>
    </div>
  `,
  styles: [
    `
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

      .map {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        pointer-events: none;
      }

      .overlay {
        position: absolute;
        inset: 0;
        pointer-events: auto;
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
  @Output() nodeSelected = new EventEmitter<string | null>();
  @Output() mapPointer = new EventEmitter<{
    type: 'down' | 'move' | 'up';
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
  }>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('graphCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private rafId: number | null = null;
  private resizeObserver?: ResizeObserver;
  private screenNodes = new Map<string, { x: number; y: number; r: number }>();
  private canvasSize = { width: 0, height: 0 };
  private transform = computeTransform(1, 1, DEFAULT_VIEWBOX);
  private needsRender = false;
  private activePointerId: number | null = null;

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }

    this.attachResizeObserver();
    this.scheduleRender();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.isBrowser) {
      return;
    }

    if (changes['graph'] || changes['nodeDetail']) {
      this.scheduleRender();
    }
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
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
    if (!this.isBrowser || this.activePointerId !== event.pointerId) {
      return;
    }

    const payload = this.buildPointerPayload(event);
    this.mapPointer.emit({ ...payload, type: 'move' });
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

  private attachResizeObserver(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      if (canvas.parentElement) {
        this.resizeObserver.observe(canvas.parentElement);
      }
    }

    this.resizeCanvas();
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

    this.screenNodes.clear();

    ctx.lineWidth = 1;

    edges.forEach((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) {
        return;
      }
      const fromPos = this.project(from);
      const toPos = this.project(to);
      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      ctx.lineTo(toPos.x, toPos.y);
      ctx.strokeStyle = edgeHighlights.has(edge.id) ? '#141414' : 'rgba(20, 20, 20, 0.2)';
      ctx.lineWidth = edgeHighlights.has(edge.id) ? 2 : 1;
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const position = this.project(node);
      const isHighlighted = nodeHighlights.has(node.id);
      const radius = isHighlighted ? NODE_RADIUS + 2 : NODE_RADIUS;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isHighlighted ? '#ffff00' : '#141414';
      ctx.strokeStyle = '#141414';
      ctx.fill();
      ctx.stroke();

      this.screenNodes.set(node.id, { x: position.x, y: position.y, r: radius });
    });
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

  private buildPointerPayload(event: PointerEvent): {
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
  } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return {
        screen: { x: 0, y: 0 },
        world: { x: 0, y: 0 },
        hitNodeId: null
      };
    }

    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const world = {
      x: (screen.x - this.transform.offsetX) / this.transform.scale,
      y: (screen.y - this.transform.offsetY) / this.transform.scale
    };
    const hitNodeId = this.hitTestNode(event);

    return { screen, world, hitNodeId };
  }
}
