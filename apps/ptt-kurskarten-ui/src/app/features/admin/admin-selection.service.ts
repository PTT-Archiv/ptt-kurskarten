import { Injectable, signal } from '@angular/core';

export type AdminSelectedType = 'node' | 'edge' | null;

@Injectable({ providedIn: 'root' })
export class AdminSelectionState {
  selectedType = signal<AdminSelectedType>(null);
  selectedNodeId = signal<string | null>(null);
  selectedEdgeId = signal<string | null>(null);
  hoveredEdgeId = signal<string | null>(null);
  pendingCreateEdgeFromNodeId = signal<string | null>(null);
  lastMapPointerPosition = signal<{ x: number; y: number } | null>(null);

  selectNode(id: string): void {
    this.selectedType.set('node');
    this.selectedNodeId.set(id);
    this.selectedEdgeId.set(null);
  }

  selectEdge(id: string): void {
    this.selectedType.set('edge');
    this.selectedEdgeId.set(id);
    this.selectedNodeId.set(null);
  }

  clearSelection(): void {
    this.selectedType.set(null);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
  }

  startEdgeFrom(nodeId: string | null): void {
    this.pendingCreateEdgeFromNodeId.set(nodeId);
  }

  clearPendingEdge(): void {
    this.pendingCreateEdgeFromNodeId.set(null);
  }
}
