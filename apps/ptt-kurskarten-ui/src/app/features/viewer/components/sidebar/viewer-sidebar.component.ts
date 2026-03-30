import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectionOption } from '@ptt-kurskarten/shared';
import type { ViewerSidebarVm } from '@viewer/viewer.models';
import { ViewerResultsPanelComponent } from '../results-panel/viewer-results-panel.component';
import { ViewerRouteDetailsPanelComponent } from '../route-details-panel/viewer-route-details-panel.component';
import { ViewerPlaceDetailsPanelComponent } from '../place-details-panel/viewer-place-details-panel.component';

@Component({
  selector: 'app-viewer-sidebar',
  imports: [
    TranslocoPipe,
    FaIconComponent,
    ViewerResultsPanelComponent,
    ViewerRouteDetailsPanelComponent,
    ViewerPlaceDetailsPanelComponent
  ],
  templateUrl: './viewer-sidebar.component.html',
  styleUrl: './viewer-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerSidebarComponent {
  readonly vmInput = input.required<ViewerSidebarVm>({ alias: 'vm' });

  readonly close = output<void>();
  readonly selectConnection = output<ConnectionOption>();
  readonly shiftTime = output<number>();
  readonly setNodeAsStart = output<string>();
  readonly setNodeAsEnd = output<string>();
  readonly hoverRouteLeg = output<string | null>();
  readonly toggleDetailsOnMap = output<boolean>();

  readonly xmarkIcon = faXmark;

  get vm(): ViewerSidebarVm {
    return this.vmInput();
  }
}
