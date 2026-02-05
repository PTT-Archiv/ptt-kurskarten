import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { ConnectionOption, GraphSnapshot, TimeHHMM } from '@ptt-kurskarten/shared';
import { TranslocoPipe } from '@jsverse/transloco';

const DEFAULT_YEAR = 1871;

@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './connections.component.html',
  styleUrl: './connections.component.css'
})
export class ConnectionsComponent {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  year = signal<number>(DEFAULT_YEAR);
  fromId = signal<string>('');
  toId = signal<string>('');
  departTime = signal<TimeHHMM>('08:00');
  nodes = signal<{ id: string; name: string }[]>([]);
  results = signal<ConnectionOption[]>([]);
  loading = signal(false);

  minYear = computed(() => DEFAULT_YEAR - 20);
  maxYear = computed(() => DEFAULT_YEAR + 20);

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        const year = this.year();
        this.fetchNodes(year);
      });
    }
  }

  onYearInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) {
      this.year.set(value);
    }
  }

  onDepartInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value as TimeHHMM;
    this.departTime.set(value);
  }

  search(): void {
    if (!this.fromId() || !this.toId()) {
      return;
    }
    this.loading.set(true);
    const year = this.year();
    const depart = this.departTime();
    const from = this.fromId();
    const to = this.toId();

    this.http
      .get<ConnectionOption[]>(
        `/api/v1/connections?year=${year}&from=${from}&to=${to}&depart=${depart}&k=5`
      )
      .subscribe({
        next: (options) => {
          this.results.set(options ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.results.set([]);
          this.loading.set(false);
        }
      });
  }

  transferCount(option: ConnectionOption): number {
    return Math.max(0, option.legs.length - 1);
  }

  getNodeName(id: string): string {
    return this.nodes().find((node) => node.id === id)?.name ?? '—';
  }

  private fetchNodes(year: number): void {
    this.http.get<GraphSnapshot>(`/api/v1/graph?year=${year}`).subscribe({
      next: (snapshot) => {
        const list = snapshot.nodes.map((node) => ({ id: node.id, name: node.name }));
        this.nodes.set(list);
        if (!this.fromId() && list.length) {
          this.fromId.set(list[0].id);
        }
        if (!this.toId() && list.length > 1) {
          this.toId.set(list[1].id);
        }
      },
      error: () => this.nodes.set([])
    });
  }
}
