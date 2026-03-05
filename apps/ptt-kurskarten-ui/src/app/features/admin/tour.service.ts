import { Injectable, computed, signal } from '@angular/core';

export type TourRequirement = 'click' | 'drag' | 'keydown' | 'selection' | 'none' | 'nodeCreated' | 'nodeMoved' | 'edgeCreated' | 'tripAdded';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  targetSelector: string;
  placement?: 'right' | 'left' | 'top' | 'bottom';
  require?: TourRequirement;
};

@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly completedKey = 'admin.tour.completed';
  steps = signal<TourStep[]>([]);
  index = signal(0);
  active = signal(false);
  fulfilled = signal<Set<TourRequirement>>(new Set());

  currentStep = computed(() => this.steps()[this.index()] ?? null);
  total = computed(() => this.steps().length);
  canNext = computed(() => {
    const step = this.currentStep();
    if (!step) {
      return false;
    }
    const requirement = step.require ?? 'none';
    if (requirement === 'none') {
      return true;
    }
    return this.fulfilled().has(requirement);
  });

  start(steps: TourStep[]): void {
    this.steps.set(steps);
    this.index.set(0);
    this.fulfilled.set(new Set());
    this.active.set(true);
  }

  next(): void {
    if (!this.canNext()) {
      return;
    }
    const nextIndex = Math.min(this.index() + 1, this.total() - 1);
    this.index.set(nextIndex);
  }

  back(): void {
    const nextIndex = Math.max(0, this.index() - 1);
    this.index.set(nextIndex);
  }

  exit(): void {
    this.active.set(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.completedKey, 'true');
    }
  }

  restart(steps: TourStep[]): void {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(this.completedKey);
    }
    this.start(steps);
  }

  markEvent(event: TourRequirement): void {
    const next = new Set(this.fulfilled());
    next.add(event);
    this.fulfilled.set(next);
  }

  skipRequirement(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }
    const requirement = step.require ?? 'none';
    if (requirement === 'none') {
      return;
    }
    this.markEvent(requirement);
  }

  isCompleted(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(this.completedKey) === 'true';
  }
}
