import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ConnectionOption, GraphSnapshot } from '@ptt-kurskarten/shared';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerDataService } from '../viewer-data.service';
import { ViewerCoreStore } from './viewer-core.store';
import { ViewerRoutingStore } from './viewer-routing.store';

function buildSnapshot(): GraphSnapshot {
  return {
    year: 1852,
    nodes: [
      { id: 'node-a', name: 'Luzern', x: 0, y: 0, validFrom: 1800 },
      { id: 'node-b', name: 'Bern', x: 0, y: 0, validFrom: 1800 },
      { id: 'node-c', name: 'Basel', x: 0, y: 0, validFrom: 1800 },
      { id: 'node-d', name: 'Geneve', x: 0, y: 0, validFrom: 1800 },
    ],
    edges: [
      {
        id: 'edge-1',
        from: 'node-a',
        to: 'node-b',
        validFrom: 1800,
        trips: [{ id: 'trip-1', transport: 'postkutsche', departs: '08:00', arrives: '09:00' }],
      },
      {
        id: 'edge-2',
        from: 'node-c',
        to: 'node-a',
        validFrom: 1800,
        trips: [{ id: 'trip-2', transport: 'postkutsche', departs: '07:00', arrives: '08:15' }],
      },
      {
        id: 'edge-3',
        from: 'node-b',
        to: 'node-d',
        validFrom: 1800,
        trips: [{ id: 'trip-3', transport: 'postkutsche', departs: '10:00', arrives: '11:00' }],
      },
    ],
  };
}

function buildConnection(partial: Partial<ConnectionOption> = {}): ConnectionOption {
  return {
    id: partial.id ?? 'route-1',
    year: partial.year ?? 1852,
    from: partial.from ?? 'node-a',
    to: partial.to ?? 'node-b',
    requestedDepart: partial.requestedDepart ?? '08:00',
    departs: partial.departs ?? '08:00',
    arrives: partial.arrives ?? '09:00',
    durationMinutes: partial.durationMinutes ?? 60,
    legs: partial.legs ?? [
      {
        edgeId: 'edge-1',
        tripId: 'trip-1',
        from: 'node-a',
        to: 'node-b',
        transport: 'postkutsche',
        departs: '08:00',
        arrives: '09:00',
      },
    ],
    kind: partial.kind ?? 'COMPLETE_JOURNEY',
  };
}

function createCoreStub() {
  return {
    year: signal(1852),
    selectedNodeId: signal<string | null>(null),
    graph: signal<GraphSnapshot | null>(null),
  };
}

describe('ViewerRoutingStore', () => {
  let store: ViewerRoutingStore;
  let core: ReturnType<typeof createCoreStub>;

  beforeEach(() => {
    core = createCoreStub();

    TestBed.configureTestingModule({
      providers: [
        ViewerRoutingStore,
        {
          provide: ViewerDataService,
          useValue: {
            getConnections: vi.fn(() => of([])),
          },
        },
        {
          provide: ViewerCoreStore,
          useValue: core,
        },
      ],
    });

    store = TestBed.inject(ViewerRoutingStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('wraps shifted departure time across midnight and keeps draft and applied time in sync', () => {
    store.departTime.set('00:10');
    store.draftDepartTime.set('00:10');

    const next = store.shiftTime(-30);

    expect(next).toBe('23:40');
    expect(store.draftDepartTime()).toBe('23:40');
    expect(store.departTime()).toBe('23:40');
  });

  it('only keeps hovered route edges active when they belong to the selected connection', () => {
    store.connectionResults.set([buildConnection()]);
    store.selectedConnectionId.set('route-1');

    store.onMapHoveredEdge('edge-1');
    expect(store.activeHoveredRouteEdgeId()).toBe('edge-1');

    store.onMapHoveredEdge('edge-3');
    expect(store.activeHoveredRouteEdgeId()).toBeNull();
  });

  it('falls back to connected node edges when no route is selected and resetSearch clears routing state', () => {
    core.graph.set(buildSnapshot());
    core.selectedNodeId.set('node-a');

    expect(Array.from(store.highlightedEdgeIds() ?? [])).toEqual(['edge-1', 'edge-2']);

    store.fromId.set('node-a');
    store.toId.set('node-b');
    store.fromPreviewId.set('node-a');
    store.toPreviewId.set('node-b');
    store.hasSearched.set(true);
    store.routingState.set('results');
    store.connectionResults.set([buildConnection()]);
    store.selectedConnectionId.set('route-1');
    store.lastSearchParams.set({ from: 'node-a', to: 'node-b', time: '08:00', year: 1852 });
    store.lastResultParams.set({ from: 'node-a', to: 'node-b', year: 1852 });

    store.resetSearch();

    expect(store.fromId()).toBe('');
    expect(store.toId()).toBe('');
    expect(store.fromPreviewId()).toBe('');
    expect(store.toPreviewId()).toBe('');
    expect(store.hasSearched()).toBe(false);
    expect(store.routingState()).toBe('idle');
    expect(store.connectionResults()).toEqual([]);
    expect(store.selectedConnectionId()).toBeNull();
    expect(store.lastSearchParams()).toBeNull();
    expect(store.lastResultParams()).toBeNull();
  });
});
