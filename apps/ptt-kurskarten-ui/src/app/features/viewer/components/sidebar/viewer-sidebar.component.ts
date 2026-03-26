import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectionOption } from '@ptt-kurskarten/shared';
import type { ViewerSidebarVm } from '../../viewer.models';
import { ViewerResultsPanelComponent } from '../results-panel/viewer-results-panel.component';
import { ViewerRouteDetailsPanelComponent } from '../route-details-panel/viewer-route-details-panel.component';
import { ViewerPlaceDetailsPanelComponent } from '../place-details-panel/viewer-place-details-panel.component';

@Component({
  selector: 'app-viewer-sidebar',
  standalone: true,
  imports: [
    TranslocoPipe,
    FaIconComponent,
    ViewerResultsPanelComponent,
    ViewerRouteDetailsPanelComponent,
    ViewerPlaceDetailsPanelComponent
  ],
  templateUrl: './viewer-sidebar.component.html',
  styleUrl: './viewer-sidebar.component.css'
})
export class ViewerSidebarComponent {
  @Input({ required: true }) vm!: ViewerSidebarVm;

  @Output() close = new EventEmitter<void>();
  @Output() selectConnection = new EventEmitter<ConnectionOption>();
  @Output() shiftTime = new EventEmitter<number>();
  @Output() setNodeAsStart = new EventEmitter<string>();
  @Output() setNodeAsEnd = new EventEmitter<string>();
  @Output() hoverRouteLeg = new EventEmitter<string | null>();
  @Output() toggleDetailsOnMap = new EventEmitter<boolean>();

  readonly xmarkIcon = faXmark;
}
