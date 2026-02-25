import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { EdgeTimetableReport, GraphSnapshot, LocalizedText, StationProfileReport } from '@ptt-kurskarten/shared';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

const DEFAULT_YEAR = 1852;

type Tab = 'station' | 'edge';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transloco = inject(TranslocoService);

  tab = signal<Tab>('station');
  year = signal<number>(DEFAULT_YEAR);
  nodes = signal<{ id: string; name: string }[]>([]);
  edges = signal<{ id: string; label: string }[]>([]);

  stationId = signal<string>('');
  edgeId = signal<string>('');

  stationReport = signal<StationProfileReport | null>(null);
  edgeReport = signal<EdgeTimetableReport | null>(null);

  constructor() {
    if (this.isBrowser) {
      this.fetchGraph(this.year());
    }
  }

  getLocalizedNote(note?: LocalizedText): string | null {
    if (!note) {
      return null;
    }
    const lang = this.transloco.getActiveLang();
    const value = (note as Record<string, string | undefined>)[lang] ?? note.de ?? note.fr;
    return value?.trim() ? value : null;
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.stationReport.set(null);
    this.edgeReport.set(null);
  }

  onYearInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) {
      this.year.set(value);
      this.fetchGraph(value);
      this.stationReport.set(null);
      this.edgeReport.set(null);
    }
  }

  runStationReport(): void {
    const nodeId = this.stationId();
    if (!nodeId) {
      this.stationReport.set(null);
      return;
    }
    this.http
      .get<StationProfileReport>(`/api/v1/report/station/${nodeId}?year=${this.year()}`)
      .subscribe({
        next: (report) => this.stationReport.set(report),
        error: () => this.stationReport.set(null)
      });
  }

  runEdgeReport(): void {
    const edgeId = this.edgeId();
    if (!edgeId) {
      this.edgeReport.set(null);
      return;
    }
    this.http
      .get<EdgeTimetableReport>(`/api/v1/report/edge/${edgeId}?year=${this.year()}`)
      .subscribe({
        next: (report) => this.edgeReport.set(report),
        error: () => this.edgeReport.set(null)
      });
  }

  exportStationCsv(): void {
    const report = this.stationReport();
    if (!report || !this.isBrowser) {
      return;
    }
    const outgoingHeader = [
      this.transloco.translate('reports.destination'),
      this.transloco.translate('label.transport'),
      this.transloco.translate('reports.tripsCount'),
      this.transloco.translate('reports.firstDeparture'),
      this.transloco.translate('reports.lastDeparture'),
      this.transloco.translate('reports.minDuration')
    ];
    const incomingHeader = [
      this.transloco.translate('reports.origin'),
      this.transloco.translate('label.transport'),
      this.transloco.translate('reports.tripsCount'),
      this.transloco.translate('reports.firstDeparture'),
      this.transloco.translate('reports.lastDeparture'),
      this.transloco.translate('reports.minDuration')
    ];
    const rows: string[][] = [
      outgoingHeader,
      ...report.outgoing.map((item) => [
        item.toNode.name,
        this.transportLabel(item.transport),
        String(item.tripsCount),
        item.firstDeparture ?? '',
        item.lastDeparture ?? '',
        item.minDurationMinutes?.toString() ?? ''
      ]),
      [],
      incomingHeader,
      ...report.incoming.map((item) => [
        item.fromNode.name,
        this.transportLabel(item.transport),
        String(item.tripsCount),
        item.firstDeparture ?? '',
        item.lastDeparture ?? '',
        item.minDurationMinutes?.toString() ?? ''
      ])
    ];

    this.downloadCsv(rows, `station-profile_${report.node?.id ?? 'unknown'}_${report.year}.csv`);
  }

  exportEdgeCsv(): void {
    const report = this.edgeReport();
    if (!report || !this.isBrowser) {
      return;
    }
    const header = [
      this.transloco.translate('label.departure'),
      this.transloco.translate('label.arrival'),
      this.transloco.translate('label.dayOffset'),
      this.transloco.translate('reports.durationMinutes')
    ];
    const rows: string[][] = [
      header,
      ...report.trips.map((trip) => [
        trip.departs,
        trip.arrives,
        (trip.arrivalDayOffset ?? 0).toString(),
        trip.durationMinutes.toString()
      ])
    ];

    this.downloadCsv(rows, `edge-timetable_${report.edge?.id ?? 'unknown'}_${report.year}.csv`);
  }

  private fetchGraph(year: number): void {
    this.http.get<GraphSnapshot>(`/api/v1/graph?year=${year}`).subscribe({
      next: (snapshot) => {
        const nodes = [...snapshot.nodes].sort((a, b) => a.name.localeCompare(b.name));
        const nodesById = new Map(nodes.map((node) => [node.id, node.name]));
        this.nodes.set(nodes.map((node) => ({ id: node.id, name: node.name })));
        this.edges.set(
          snapshot.edges.map((edge) => ({
            id: edge.id,
            label: `${nodesById.get(edge.from) ?? '—'} → ${nodesById.get(edge.to) ?? '—'} (${this.transportLabel(
              edge.trips?.[0]?.transport ?? 'postkutsche'
            )})`
          }))
        );
        if (!this.stationId() && nodes.length) {
          this.stationId.set(nodes[0].id);
        }
        if (!this.edgeId() && snapshot.edges.length) {
          this.edgeId.set(snapshot.edges[0].id);
        }
      },
      error: () => {
        this.nodes.set([]);
        this.edges.set([]);
      }
    });
  }

  private downloadCsv(rows: string[][], filename: string): void {
    const csv = rows.map((row) => row.map((value) => this.escapeCsv(value)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: string): string {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private transportLabel(transport: string): string {
    const key = `transport.${transport}`;
    const label = this.transloco.translate(key);
    return label === key ? transport : label;
  }
}
