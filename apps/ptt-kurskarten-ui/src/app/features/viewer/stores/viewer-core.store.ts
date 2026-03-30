import { PLATFORM_ID, computed, inject, Injectable, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { EditionEntry, GraphAssertion, GraphNode, GraphSnapshot } from '@ptt-kurskarten/shared';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { environment } from '@env/environment';
import { ViewerDataService } from '@viewer/viewer-data.service';
import { buildNodeNameById, getNodeById } from '@viewer/utils/viewer-node-selectors.util';

const DEFAULT_YEAR = 1852;
const TABLET_BREAKPOINT_PX = 1024;
const DEFAULT_VIEWPORT_HEIGHT = 900;

@Injectable()
export class ViewerCoreStore {
  private readonly viewerData = inject(ViewerDataService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transloco = inject(TranslocoService);

  readonly isBrowser = isPlatformBrowser(this.platformId);
  readonly readonlyViewer = environment.readonlyViewer;
  readonly archiveModeEnabled = environment.enableArchiveMode;
  readonly mapLayerPreviewUrl = 'assets/maps/switzerland.svg';

  readonly year = signal<number>(DEFAULT_YEAR);
  readonly graph = signal<GraphSnapshot | null>(null);
  readonly selectedNodeId = signal<string | null>(null);
  readonly availableYears = signal<number[]>([]);
  readonly editions = signal<EditionEntry[]>([]);
  readonly nodeAliases = signal<Record<string, string[]>>({});
  readonly nodeFacts = signal<GraphAssertion[]>([]);
  readonly mapSettled = signal(false);
  readonly activeLang = signal<'de' | 'fr'>(this.transloco.getActiveLang() === 'fr' ? 'fr' : 'de');
  readonly viewportWidth = signal<number>(this.getViewportWidth());
  readonly viewportHeight = signal<number>(this.getViewportHeight());
  readonly resetViewportToken = signal(0);
  readonly hoveredNodeId = signal<string | null>(null);
  readonly hoveredNodeScreen = signal<{ x: number; y: number } | null>(null);
  readonly transientPulseIds = signal<Set<string>>(new Set());

  private readonly pulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private nodeFactsRequestSeq = 0;
  private langSub?: Subscription;

  readonly nodes = computed(() => {
    const snapshot = this.graph();
    if (!snapshot) {
      return [];
    }
    return [...snapshot.nodes].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly nodeNameById = computed<Record<string, string>>(() => buildNodeNameById(this.nodes()));

  readonly publicEditionOptions = computed(() => {
    const editions = this.editions();
    if (editions.length > 0) {
      return editions.filter((edition) => edition.public !== false);
    }
    return this.availableYears().map((year) => ({
      id: `year-${year}`,
      year,
      title: String(year),
      public: true
    }));
  });

  readonly selectedEditionLabel = computed(() => {
    const currentYear = this.year();
    const editions = this.publicEditionOptions();
    const selected = editions.find((edition) => edition.year === currentYear);
    if (selected) {
      return selected.title || String(selected.year);
    }
    const anyEdition = this.editions().find((edition) => edition.year === currentYear);
    return anyEdition?.title || String(currentYear);
  });

  readonly nodeAliasesById = computed<Record<string, string[]>>(() => {
    const aliasesById = this.nodeAliases();
    const aliases: Record<string, string[]> = {};
    for (const node of this.nodes()) {
      aliases[node.id] = aliasesById[node.id] ?? [];
    }
    return aliases;
  });

  init(): void {
    if (this.isBrowser) {
      this.fetchYears();
      this.fetchEditions();
      this.fetchGraph(this.year());
    }
    this.langSub = this.transloco.langChanges$.subscribe((lang) => {
      this.activeLang.set(lang === 'fr' ? 'fr' : 'de');
    });
  }

  destroy(): void {
    this.langSub?.unsubscribe();
    for (const timeout of this.pulseTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pulseTimeouts.clear();
  }

  afterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }
    requestAnimationFrame(() => this.mapSettled.set(true));
  }

  onWindowResize(): void {
    this.viewportWidth.set(this.getViewportWidth());
    this.viewportHeight.set(this.getViewportHeight());
  }

  setLang(lang: 'de' | 'fr'): void {
    this.activeLang.set(lang);
    this.transloco.setActiveLang(lang);
  }

  applyYearChange(nextYear: number): void {
    this.year.set(nextYear);
    this.fetchGraph(nextYear);
  }

  fetchNodeFacts(nodeId: string, year: number): void {
    const requestSeq = ++this.nodeFactsRequestSeq;
    this.viewerData.getAssertions({ year, targetType: 'place', targetId: nodeId }).subscribe({
      next: (facts) => {
        if (requestSeq === this.nodeFactsRequestSeq) {
          this.nodeFacts.set(facts ?? []);
        }
      },
      error: () => {
        if (requestSeq === this.nodeFactsRequestSeq) {
          this.nodeFacts.set([]);
        }
      }
    });
  }

  clearNodeFacts(): void {
    this.nodeFacts.set([]);
  }

  getNodeName(id: string): string {
    return this.nodeNameById()[id] ?? '—';
  }

  getNodeLabel(id: string): string {
    return this.nodeNameById()[id] ?? id;
  }

  getNodeById(id: string | null): { id: string; name: string } | null {
    if (!id) {
      return null;
    }
    const name = this.nodeNameById()[id];
    return name ? { id, name } : null;
  }

  getNodeByIdFull(id: string | null): GraphNode | null {
    return getNodeById(this.graph(), id);
  }

  triggerPulse(nodeId: string): void {
    if (!nodeId) {
      return;
    }
    const next = new Set(this.transientPulseIds());
    next.add(nodeId);
    this.transientPulseIds.set(next);
    const existing = this.pulseTimeouts.get(nodeId);
    if (existing) {
      clearTimeout(existing);
    }
    const handle = setTimeout(() => {
      const updated = new Set(this.transientPulseIds());
      updated.delete(nodeId);
      this.transientPulseIds.set(updated);
      this.pulseTimeouts.delete(nodeId);
    }, 1400);
    this.pulseTimeouts.set(nodeId, handle);
  }

  resetMapView(): void {
    this.resetViewportToken.set(this.resetViewportToken() + 1);
  }

  private fetchYears(): void {
    this.viewerData.getYears().subscribe({
      next: (years) => this.availableYears.set(years),
      error: () => this.availableYears.set([])
    });
  }

  private fetchEditions(): void {
    this.viewerData.getEditions().subscribe({
      next: (editions) => this.editions.set(editions ?? []),
      error: () => this.editions.set([])
    });
  }

  private fetchGraph(year: number): void {
    this.fetchNodeAliases(year);
    this.viewerData.getGraph(year).subscribe({
      next: (graph) => {
        this.graph.set(graph);
        this.selectedNodeId.set(null);
      },
      error: () => this.graph.set(null)
    });
  }

  private fetchNodeAliases(year: number): void {
    this.viewerData.getNodeAliases(year).subscribe({
      next: (aliases) => this.nodeAliases.set(aliases ?? {}),
      error: () => this.nodeAliases.set({})
    });
  }

  private getViewportWidth(): number {
    return this.isBrowser ? window.innerWidth || TABLET_BREAKPOINT_PX : TABLET_BREAKPOINT_PX;
  }

  private getViewportHeight(): number {
    return this.isBrowser ? window.innerHeight || DEFAULT_VIEWPORT_HEIGHT : DEFAULT_VIEWPORT_HEIGHT;
  }
}
