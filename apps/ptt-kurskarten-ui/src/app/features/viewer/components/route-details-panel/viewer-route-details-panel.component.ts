import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ViewerRouteDetailsVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-route-details-panel',
  imports: [TranslocoPipe],
  templateUrl: './viewer-route-details-panel.component.html',
  styleUrl: './viewer-route-details-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerRouteDetailsPanelComponent {
  readonly vmInput = input.required<ViewerRouteDetailsVm>({ alias: 'vm' });

  readonly hoverRouteLeg = output<string | null>();
  readonly toggleDetailsOnMap = output<boolean>();

  get vm(): ViewerRouteDetailsVm {
    return this.vmInput();
  }
}
