import { computed, inject, Injectable, signal } from '@angular/core';
import { nodeSearchTerms, normalizeSearch } from '../utils/viewer-search.util';
import { ViewerCoreStore } from './viewer-core.store';

@Injectable()
export class ViewerSearchStore {
  private readonly core = inject(ViewerCoreStore);

  readonly placeSearchQuery = signal('');
  readonly placeSearchOpen = signal(false);
  readonly placeSearchActiveIndex = signal(0);
  readonly placeSearchPreviewId = signal('');

  private placeSearchBlurHandle: ReturnType<typeof setTimeout> | null = null;

  readonly placeSearchResults = computed(() => {
    const query = normalizeSearch(this.placeSearchQuery());
    if (!query) {
      return this.core.nodes().slice(0, 12);
    }
    const aliasesById = this.core.nodeAliases();
    return this.core
      .nodes()
      .filter((node) => nodeSearchTerms(node, aliasesById).some((term) => term.includes(query)))
      .slice(0, 12);
  });

  destroy(): void {
    if (this.placeSearchBlurHandle) {
      clearTimeout(this.placeSearchBlurHandle);
      this.placeSearchBlurHandle = null;
    }
  }

  focus(): void {
    if (this.placeSearchBlurHandle) {
      clearTimeout(this.placeSearchBlurHandle);
      this.placeSearchBlurHandle = null;
    }
    this.placeSearchOpen.set(true);
    this.syncPlaceSearchPreview();
  }

  blur(): void {
    this.placeSearchBlurHandle = setTimeout(() => {
      this.placeSearchOpen.set(false);
      this.placeSearchPreviewId.set('');
    }, 120);
  }

  input(value: string): void {
    this.placeSearchQuery.set(value);
    this.placeSearchOpen.set(true);
    this.placeSearchActiveIndex.set(0);
    this.syncPlaceSearchPreview();
  }

  moveActive(delta: number): void {
    const results = this.placeSearchResults();
    if (!results.length) {
      return;
    }
    this.placeSearchOpen.set(true);
    this.placeSearchActiveIndex.set((this.placeSearchActiveIndex() + delta + results.length) % results.length);
    this.syncPlaceSearchPreview();
  }

  previewResult(nodeId: string, index: number): void {
    this.placeSearchActiveIndex.set(index);
    this.placeSearchPreviewId.set(nodeId);
  }

  activeResult() {
    const results = this.placeSearchResults();
    return results[this.placeSearchActiveIndex()] ?? results[0] ?? null;
  }

  completeSelection(nodeName: string): void {
    this.placeSearchQuery.set(nodeName);
    this.placeSearchOpen.set(false);
    this.placeSearchPreviewId.set('');
  }

  close(): void {
    this.placeSearchOpen.set(false);
    this.placeSearchPreviewId.set('');
  }

  syncPlaceSearchPreview(): void {
    const results = this.placeSearchResults();
    if (!results.length) {
      this.placeSearchPreviewId.set('');
      return;
    }
    const index = Math.max(0, Math.min(this.placeSearchActiveIndex(), results.length - 1));
    this.placeSearchActiveIndex.set(index);
    this.placeSearchPreviewId.set(results[index]?.id ?? '');
  }
}
