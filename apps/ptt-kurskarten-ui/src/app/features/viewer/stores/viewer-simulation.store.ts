import { PLATFORM_ID, computed, inject, Injectable, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  isTripFlowEdgeMode,
  isTripFlowNodeMode,
  type TripFlowEdgeMode,
  type TripFlowNodeMode
} from '../../../shared/map/map-stage-simulation.util';
import type { TripFlowModeOption } from '../viewer.models';
import { ViewerArchiveStore } from './viewer-archive.store';
import { ViewerLayoutStore } from './viewer-layout.store';

const MINUTES_PER_DAY = 1440;
const SIMULATION_DAY_MS = 60_000;

@Injectable()
export class ViewerSimulationStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly archive = inject(ViewerArchiveStore);
  private readonly layout = inject(ViewerLayoutStore);

  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private simulationRafId: number | null = null;
  private simulationLastTs: number | null = null;

  readonly tripFlowNodeMode = signal<TripFlowNodeMode>('always-active');
  readonly tripFlowEdgeMode = signal<TripFlowEdgeMode>('always-active');
  readonly simulationPlaying = signal(false);
  readonly simulationMinute = signal(0);

  readonly tripFlowNodeModeOptions: TripFlowModeOption<TripFlowNodeMode>[] = [
    { value: 'always-active', labelKey: 'viewer.tripFlowModeAlwaysActive' },
    { value: 'unhighlighted', labelKey: 'viewer.tripFlowModeUnhighlighted' },
    { value: 'not-visible', labelKey: 'viewer.tripFlowModeNotVisible' },
    { value: 'active-when-relevant-muted', labelKey: 'viewer.tripFlowModeRelevantMuted' },
    { value: 'active-when-relevant-hidden', labelKey: 'viewer.tripFlowModeRelevantHidden' },
    { value: 'organic', labelKey: 'viewer.tripFlowModeOrganic' }
  ];

  readonly tripFlowEdgeModeOptions: TripFlowModeOption<TripFlowEdgeMode>[] = [
    { value: 'always-active', labelKey: 'viewer.tripFlowModeAlwaysActive' },
    { value: 'unhighlighted', labelKey: 'viewer.tripFlowModeUnhighlighted' },
    { value: 'not-visible', labelKey: 'viewer.tripFlowModeNotVisible' },
    { value: 'active-when-relevant-muted', labelKey: 'viewer.tripFlowModeRelevantMuted' },
    { value: 'active-when-relevant-hidden', labelKey: 'viewer.tripFlowModeRelevantHidden' }
  ];

  readonly animationAllowed = computed(() => !this.archive.archiveModeActive() && !this.layout.sidePanelVisible());
  readonly orbitVisible = computed(() => this.animationAllowed());
  readonly simulationMinuteForMap = computed<number | null>(() => (this.animationAllowed() ? this.simulationMinute() : null));

  destroy(): void {
    this.stopSimulationPlayback();
  }

  onTripFlowNodeModeChange(value: string): void {
    if (isTripFlowNodeMode(value)) {
      this.tripFlowNodeMode.set(value);
    }
  }

  onTripFlowEdgeModeChange(value: string): void {
    if (isTripFlowEdgeMode(value)) {
      this.tripFlowEdgeMode.set(value);
    }
  }

  syncAnimationAllowance(): void {
    if (!this.isBrowser) {
      return;
    }
    const allowed = this.animationAllowed();
    if (!allowed) {
      this.simulationPlaying.set(false);
      this.stopSimulationPlayback();
      return;
    }
    if (!this.simulationPlaying()) {
      this.simulationMinute.set(this.getCurrentMinuteOfDay());
      this.simulationPlaying.set(true);
    }
  }

  syncPlayback(): void {
    if (!this.isBrowser) {
      return;
    }
    const shouldPlay = this.animationAllowed() && this.simulationPlaying();
    if (shouldPlay) {
      this.startSimulationPlayback();
    } else {
      this.stopSimulationPlayback();
    }
  }

  private startSimulationPlayback(): void {
    if (!this.isBrowser || this.simulationRafId !== null) {
      return;
    }
    this.simulationLastTs = null;
    this.simulationRafId = requestAnimationFrame(this.onSimulationFrame);
  }

  private stopSimulationPlayback(): void {
    if (!this.isBrowser) {
      return;
    }
    if (this.simulationRafId !== null) {
      cancelAnimationFrame(this.simulationRafId);
    }
    this.simulationRafId = null;
    this.simulationLastTs = null;
  }

  private readonly onSimulationFrame = (ts: number): void => {
    if (!this.isBrowser) {
      return;
    }
    if (!this.animationAllowed() || !this.simulationPlaying()) {
      this.simulationRafId = null;
      this.simulationLastTs = null;
      return;
    }
    if (this.simulationLastTs === null) {
      this.simulationLastTs = ts;
    }
    const deltaMs = Math.max(0, ts - this.simulationLastTs);
    this.simulationLastTs = ts;
    const minuteAdvance = (deltaMs / SIMULATION_DAY_MS) * MINUTES_PER_DAY * 3;
    if (minuteAdvance > 0) {
      this.simulationMinute.set(this.normalizeMinuteOfDay(this.simulationMinute() + minuteAdvance));
    }
    this.simulationRafId = requestAnimationFrame(this.onSimulationFrame);
  };

  private getCurrentMinuteOfDay(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;
  }

  private normalizeMinuteOfDay(value: number): number {
    return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }
}
