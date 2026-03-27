import { computed, inject, Injectable, signal } from '@angular/core';
import {
  ARCHIVE_DEFAULT_REGION,
  buildArchiveIiifInfoUrl,
  buildArchiveSnippetUrlForNode,
  buildArchiveSnippetUrlFromRegionWithBase,
  computeArchiveTransform,
  getArchiveIiifCenter,
  normalizeIiifRoute,
  type ArchiveTransform
} from '../../shared/archive/archive-snippet.util';
import { getDefaultArchiveNode } from './viewer-node-selectors.util';
import { ViewerCoreStore } from './viewer-core.store';
import { ViewerRoutingStore } from './viewer-routing.store';
import type { ViewerSurfaceMode } from './viewer.models';

@Injectable()
export class ViewerArchiveStore {
  private readonly core = inject(ViewerCoreStore);
  private readonly routing = inject(ViewerRoutingStore);

  readonly viewerSurfaceMode = signal<ViewerSurfaceMode>('map');
  readonly archiveFocusNodeId = signal<string | null>(null);
  readonly archiveTransform = signal<ArchiveTransform>(computeArchiveTransform());

  readonly archiveModeActive = computed(() => this.core.archiveModeEnabled && this.viewerSurfaceMode() === 'archive');
  readonly archiveIiifRoute = computed(() => {
    const edition = this.core.editions().find((item) => item.year === this.core.year());
    return normalizeIiifRoute(edition?.iiifRoute);
  });
  readonly archiveIiifInfoUrl = computed(() => buildArchiveIiifInfoUrl(this.archiveIiifRoute()));

  readonly archiveSnippetNode = computed(() => {
    const graph = this.core.graph();
    if (!graph) {
      return null;
    }
    const preferredId = this.core.selectedNodeId() || this.routing.fromId() || this.routing.toId();
    if (preferredId) {
      return graph.nodes.find((node) => node.id === preferredId) ?? getDefaultArchiveNode(graph);
    }
    return getDefaultArchiveNode(graph);
  });

  readonly archiveStageNode = computed(() => {
    const focusedId = this.archiveFocusNodeId();
    if (focusedId) {
      return this.core.getNodeByIdFull(focusedId);
    }
    const preferredId = this.core.selectedNodeId() || this.routing.fromId() || this.routing.toId();
    return preferredId ? this.core.getNodeByIdFull(preferredId) : null;
  });

  readonly archiveSnippetUrl = computed(() => {
    const node = this.archiveSnippetNode();
    const transform = this.archiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    if (node) {
      return buildArchiveSnippetUrlForNode(node, transform, iiifRoute);
    }
    return buildArchiveSnippetUrlFromRegionWithBase(ARCHIVE_DEFAULT_REGION, iiifRoute);
  });

  readonly archiveStageInitialCenter = computed(() => {
    const node = this.getDefaultArchiveStageNode();
    if (!node) {
      return null;
    }
    return getArchiveIiifCenter(node, this.archiveTransform());
  });

  readonly archiveStageImageUrl = computed(() => {
    const node = this.archiveStageNode();
    const transform = this.archiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    if (node) {
      return buildArchiveSnippetUrlForNode(node, transform, iiifRoute);
    }
    return '';
  });

  readonly inactiveSurfaceMode = computed<ViewerSurfaceMode>(() => (this.viewerSurfaceMode() === 'map' ? 'archive' : 'map'));
  readonly inactiveSurfacePreviewImageUrl = computed(() => {
    if (this.inactiveSurfaceMode() === 'map') {
      return this.core.mapLayerPreviewUrl;
    }
    return this.archiveStageImageUrl() || this.archiveSnippetUrl() || '';
  });

  setArchiveFocusNode(nodeId: string | null): void {
    this.archiveFocusNodeId.set(nodeId);
  }

  setViewerSurfaceMode(mode: ViewerSurfaceMode): void {
    if (mode === 'archive' && !this.core.archiveModeEnabled) {
      return;
    }
    this.viewerSurfaceMode.set(mode);
    if (mode === 'archive' && !this.archiveFocusNodeId()) {
      this.archiveFocusNodeId.set(this.core.selectedNodeId() ?? this.routing.fromId() ?? this.routing.toId() ?? null);
    }
  }

  toggleViewerSurfaceMode(): void {
    this.setViewerSurfaceMode(this.inactiveSurfaceMode());
  }

  private getDefaultArchiveStageNode() {
    const stageNode = this.archiveStageNode();
    if (stageNode) {
      return stageNode;
    }
    return getDefaultArchiveNode(this.core.graph());
  }
}
