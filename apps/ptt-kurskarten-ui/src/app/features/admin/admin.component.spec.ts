import { provideHttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EditionEntry, GraphAssertion, GraphEdge, GraphNode, GraphNodePatch, GraphSnapshot } from '@ptt-kurskarten/shared';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_GRAPH_REPOSITORY, type AdminGraphRepository } from './admin-graph.repository';
import { AdminComponent } from './admin.component';

function buildNode(id: string, name: string): GraphNode {
  return {
    id,
    name,
    x: 0,
    y: 0,
    validFrom: 1852
  };
}

function buildEdge(partial: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: partial.id ?? 'edge-1',
    from: partial.from ?? 'node-a',
    to: partial.to ?? 'node-b',
    distance: partial.distance,
    validFrom: partial.validFrom ?? 1852,
    notes: partial.notes,
    trips: partial.trips ?? [{ id: 'trip-1', transport: 'postkutsche', departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 }]
  };
}

function buildSnapshot(edges: GraphEdge[] = []): GraphSnapshot {
  return {
    year: 1852,
    nodes: [buildNode('node-a', 'Misocco'), buildNode('node-b', 'San Bernhardino')],
    edges
  };
}

function createRepoStub(): AdminGraphRepository & { createEdge: ReturnType<typeof vi.fn> } {
  return {
    loadYears: vi.fn(() => of([1852])),
    loadEditions: vi.fn(() => of([{ id: 'edition-1852', year: 1852 }] as EditionEntry[])),
    loadGraph: vi.fn(() => of(buildSnapshot())),
    loadAssertions: vi.fn(() => of([] satisfies GraphAssertion[])),
    createAssertion: vi.fn(),
    updateAssertion: vi.fn(),
    deleteAssertion: vi.fn(() => of({ deleted: true })),
    searchPlaces: vi.fn(() => of([])),
    createNode: vi.fn(),
    updateNode: vi.fn((_id: string, patch: GraphNodePatch) => of({ id: 'node-new', name: 'New', x: 0, y: 0, validFrom: 1852, ...patch })),
    setNodeVisibility: vi.fn(() => of({ updated: true, id: 'node-a', year: 1852, hidden: false })),
    deleteNode: vi.fn(() => of({ deleted: true })),
    createEdge: vi.fn((edge: GraphEdge) => of({ ...edge, id: 'edge-created' })),
    updateEdge: vi.fn(),
    deleteEdge: vi.fn(() => of({ deleted: true })),
    updateEdition: vi.fn(),
    reset: vi.fn(() => of(undefined)),
    isDemo: false
  };
}

describe('AdminComponent quick service reverse pair flow', () => {
  let repo: ReturnType<typeof createRepoStub>;

  beforeEach(async () => {
    repo = createRepoStub();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideHttpClient(),
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: ADMIN_GRAPH_REPOSITORY, useValue: repo }
      ]
    })
      .overrideComponent(AdminComponent, {
        set: {
          template: `<button #addQuickTripButton type="button" (click)="addQuickTrip()">+ Fahrt hinzufügen</button>`
        }
      })
      .compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('prefills the reversed service draft and focuses add trip after saving a missing reverse pair', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    const component = fixture.componentInstance;
    component.graph.set(buildSnapshot());
    component.quickFromId.set('node-a');
    component.quickFromQuery.set('Misocco');
    component.quickToId.set('node-b');
    component.quickToQuery.set('San Bernhardino');
    component.quickDistance.set('42');
    component.quickServiceNoteDe.set('Hinweis');
    component.quickServiceNoteFr.set('Note');
    fixture.detectChanges();

    const addTripButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    component.saveQuickEdge();
    fixture.detectChanges();

    expect(repo.createEdge).toHaveBeenCalledOnce();
    expect(component.quickFromId()).toBe('node-b');
    expect(component.quickFromQuery()).toBe('San Bernhardino');
    expect(component.quickToId()).toBe('node-a');
    expect(component.quickToQuery()).toBe('Misocco');
    expect(component.quickDistance()).toBe('42');
    expect(component.quickTrips()).toHaveLength(1);
    expect(component.quickTrips()[0]).toMatchObject({
      transport: 'postkutsche',
      departs: '08:00',
      arrives: '09:00',
      arrivalDayOffset: 0
    });
    expect(component.quickServiceNoteDe()).toBe('');
    expect(component.quickServiceNoteFr()).toBe('');
    expect(document.activeElement).toBe(addTripButton);
  });

  it('keeps the existing reset behavior when there is no missing reverse pair hint', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    const component = fixture.componentInstance;
    component.graph.set(
      buildSnapshot([
        buildEdge({ id: 'edge-forward', from: 'node-a', to: 'node-b', distance: 42 }),
        buildEdge({ id: 'edge-reverse', from: 'node-b', to: 'node-a', distance: 42 })
      ])
    );
    component.quickFromId.set('node-a');
    component.quickFromQuery.set('Misocco');
    component.quickToId.set('node-b');
    component.quickToQuery.set('San Bernhardino');
    component.quickDistance.set('42');
    component.quickServiceNoteDe.set('Hinweis');
    component.quickServiceNoteFr.set('Note');
    fixture.detectChanges();

    component.saveQuickEdge();

    expect(component.quickFromId()).toBe('node-a');
    expect(component.quickFromQuery()).toBe('Misocco');
    expect(component.quickToId()).toBeNull();
    expect(component.quickToQuery()).toBe('');
    expect(component.quickDistance()).toBe('');
    expect(component.quickTrips()).toHaveLength(1);
    expect(component.quickServiceNoteDe()).toBe('');
    expect(component.quickServiceNoteFr()).toBe('');
  });

  it('does not prefill the reverse draft when pair state resolves to reverseOnly', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    const component = fixture.componentInstance;
    component.graph.set(buildSnapshot());
    component.quickFromId.set('node-a');
    component.quickFromQuery.set('Misocco');
    component.quickToId.set('node-b');
    component.quickToQuery.set('San Bernhardino');
    component.quickDistance.set('42');
    fixture.detectChanges();

    vi.spyOn(component as any, 'resolveDirectionalPairState').mockReturnValue('reverseOnly');

    component.saveQuickEdge();

    expect(component.quickFromId()).toBe('node-a');
    expect(component.quickToId()).toBeNull();
    expect(component.quickToQuery()).toBe('');
    expect(component.quickDistance()).toBe('');
  });
});
