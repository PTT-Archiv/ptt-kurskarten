import { computed, inject, Injectable, signal } from '@angular/core';
import type { MobileSheetMode, MobileSheetSnap } from '../viewer.models';
import { ViewerArchiveStore } from './viewer-archive.store';
import { ViewerCoreStore } from './viewer-core.store';
import { ViewerRoutingStore } from './viewer-routing.store';

const TABLET_BREAKPOINT_PX = 1024;
const MOBILE_BREAKPOINT_PX = 768;

@Injectable()
export class ViewerLayoutStore {
  private readonly core = inject(ViewerCoreStore);
  private readonly routing = inject(ViewerRoutingStore);
  private readonly archive = inject(ViewerArchiveStore);

  readonly sidebarOpen = signal(false);
  readonly plannerHovered = signal(false);
  readonly plannerFocused = signal(false);
  readonly helpOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly mobileSheetMode = signal<MobileSheetMode>('closed');
  readonly mobileSheetSnap = signal<MobileSheetSnap>('half');
  readonly routePlannerOpen = signal(false);
  readonly routePlannerFocusToken = signal(0);
  readonly pickTarget = signal<'from' | 'to' | null>(null);

  private plannerBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingMapPickTarget: 'from' | 'to' | null = null;

  readonly smallScreenLayout = computed(() => this.core.viewportWidth() < TABLET_BREAKPOINT_PX);
  readonly mobileLayout = computed(() => this.core.viewportWidth() < MOBILE_BREAKPOINT_PX);
  readonly mobileSheetVisible = computed(
    () => !this.archive.archiveModeActive() && this.smallScreenLayout() && this.mobileSheetMode() !== 'closed'
  );

  readonly mobileSheetHeight = computed(() => {
    if (!this.mobileSheetVisible()) {
      return 0;
    }
    const height = this.core.viewportHeight();
    if (height <= 0) {
      return 0;
    }
    const snap = this.mobileSheetSnap();
    if (snap === 'peek') {
      return 78;
    }
    if (this.mobileLayout()) {
      return snap === 'full' ? Math.min(height * 0.86, 820) : Math.min(height * 0.54, 460);
    }
    return snap === 'full' ? Math.min(height * 0.82, 760) : Math.min(height * 0.48, 420);
  });

  readonly sidePanelVisible = computed(() => {
    if (this.archive.archiveModeActive()) {
      return false;
    }
    if (this.smallScreenLayout()) {
      const mode = this.mobileSheetMode();
      return mode === 'results' || mode === 'details';
    }
    return this.sidebarOpen();
  });

  readonly actionStackBottomOffset = computed(() => {
    const baseOffset = this.mobileLayout() ? 12 : 16;
    return this.mobileSheetVisible() ? this.mobileSheetHeight() + baseOffset : baseOffset;
  });

  readonly routeFitTopInset = computed(() => {
    if (this.smallScreenLayout()) {
      return this.routePlannerOpen() ? 184 : 126;
    }
    return this.routePlannerOpen() ? 260 : 132;
  });

  readonly viewportFocusTopInset = computed(() => (this.smallScreenLayout() ? this.routeFitTopInset() : 0));
  readonly viewportFocusBottomInset = computed(() => (this.smallScreenLayout() ? this.mobileSheetHeight() : 0));

  destroy(): void {
    if (this.plannerBlurHandle) {
      clearTimeout(this.plannerBlurHandle);
      this.plannerBlurHandle = null;
    }
  }

  toggleHelp(): void {
    this.helpOpen.set(!this.helpOpen());
    this.settingsOpen.set(false);
  }

  toggleSettings(): void {
    this.settingsOpen.set(!this.settingsOpen());
    this.helpOpen.set(false);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
  }

  onPlannerFocus(active: boolean): void {
    if (this.plannerBlurHandle) {
      clearTimeout(this.plannerBlurHandle);
      this.plannerBlurHandle = null;
    }
    if (active) {
      this.plannerFocused.set(true);
      return;
    }
    this.plannerBlurHandle = setTimeout(() => this.plannerFocused.set(false), 120);
  }

  onPlannerHover(active: boolean): void {
    this.plannerHovered.set(active);
  }

  openRoutePlanner(): void {
    this.routePlannerOpen.set(true);
    this.routePlannerFocusToken.set(this.routePlannerFocusToken() + 1);
    if (this.smallScreenLayout()) {
      this.mobileSheetMode.set('planner');
      this.mobileSheetSnap.set('full');
      this.sidebarOpen.set(false);
    }
  }

  closeRoutePlanner(): void {
    this.routePlannerOpen.set(false);
    this.clearPendingMapPick();
    this.pickTarget.set(null);
    if (this.smallScreenLayout()) {
      if (this.routing.routeResultsVisible()) {
        this.mobileSheetMode.set('results');
        this.mobileSheetSnap.set('half');
      } else if (this.core.selectedNodeId()) {
        this.mobileSheetMode.set('details');
        this.mobileSheetSnap.set('half');
      } else {
        this.mobileSheetMode.set('closed');
      }
    }
  }

  setMobileSheetSnap(snap: MobileSheetSnap): void {
    this.mobileSheetSnap.set(snap);
  }

  cycleMobileSheetSnap(): void {
    const nextBySnap: Record<MobileSheetSnap, MobileSheetSnap> = { peek: 'half', half: 'full', full: 'peek' };
    this.mobileSheetSnap.set(nextBySnap[this.mobileSheetSnap()]);
  }

  openMobileResults(): void {
    if (!this.smallScreenLayout() || !this.routing.routeResultsVisible()) {
      return;
    }
    this.core.selectedNodeId.set(null);
    this.mobileSheetMode.set('results');
    this.mobileSheetSnap.set('half');
  }

  closeMobileSheet(resetSearch: () => void): void {
    const mode = this.mobileSheetMode();
    if (mode === 'planner') {
      this.closeRoutePlanner();
      return;
    }
    if (mode === 'details' && this.routing.routeResultsVisible()) {
      this.core.selectedNodeId.set(null);
      this.mobileSheetMode.set('results');
      this.mobileSheetSnap.set('half');
      return;
    }
    if (mode === 'details') {
      this.core.selectedNodeId.set(null);
      this.sidebarOpen.set(false);
      this.mobileSheetMode.set('closed');
      this.mobileSheetSnap.set('half');
      return;
    }
    if (mode === 'results') {
      resetSearch();
      this.mobileSheetMode.set('closed');
      this.mobileSheetSnap.set('half');
    }
  }

  syncMobileSheetMode(): void {
    const isSmall = this.smallScreenLayout();
    const archiveMode = this.archive.archiveModeActive();
    if (!isSmall || archiveMode) {
      this.mobileSheetMode.set('closed');
      this.mobileSheetSnap.set('half');
      return;
    }
    if (this.routePlannerOpen()) {
      this.mobileSheetMode.set('planner');
      if (this.mobileSheetSnap() === 'peek') {
        this.mobileSheetSnap.set('half');
      }
      return;
    }
    if (this.core.selectedNodeId()) {
      this.mobileSheetMode.set('details');
      if (this.mobileSheetSnap() === 'peek') {
        this.mobileSheetSnap.set('half');
      }
      return;
    }
    if (this.routing.routeResultsVisible()) {
      if (this.mobileSheetMode() === 'closed') {
        this.mobileSheetMode.set('results');
      }
      return;
    }
    if (!this.helpOpen() && !this.settingsOpen()) {
      this.mobileSheetMode.set('closed');
    }
  }

  handleArchiveModeActivated(): void {
    this.routePlannerOpen.set(false);
    this.sidebarOpen.set(false);
    this.pickTarget.set(null);
    this.clearPendingMapPick();
  }

  setPickTarget(target: 'from' | 'to' | null): void {
    this.pickTarget.set(target);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.pickTarget()) {
      this.clearPendingMapPick();
      this.pickTarget.set(null);
    }
  }

  rememberPendingMapPick(): void {
    this.pendingMapPickTarget = this.pickTarget();
  }

  clearPendingMapPick(): void {
    this.pendingMapPickTarget = null;
  }

  effectivePickTarget(): 'from' | 'to' | null {
    return this.pickTarget() ?? this.pendingMapPickTarget;
  }
}
