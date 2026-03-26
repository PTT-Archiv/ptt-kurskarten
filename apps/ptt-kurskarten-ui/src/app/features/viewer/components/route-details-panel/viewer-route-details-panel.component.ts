import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ViewerRouteDetailsVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-route-details-panel',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './viewer-route-details-panel.component.html',
  styleUrl: './viewer-route-details-panel.component.css'
})
export class ViewerRouteDetailsPanelComponent {
  @Input({ required: true }) vm!: ViewerRouteDetailsVm;

  @Output() hoverRouteLeg = new EventEmitter<string | null>();
  @Output() toggleDetailsOnMap = new EventEmitter<boolean>();
}
