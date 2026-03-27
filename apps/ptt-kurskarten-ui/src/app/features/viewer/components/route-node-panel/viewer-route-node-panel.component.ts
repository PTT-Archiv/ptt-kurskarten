import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faFlag, faLocationDot, faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ViewerRouteNodePanelVm } from '../../viewer.models';
import { ArchiveSnippetViewerComponent } from '../../../../shared/archive/archive-snippet-viewer.component';

@Component({
  selector: 'app-viewer-route-node-panel',
  imports: [TranslocoPipe, FaIconComponent, ArchiveSnippetViewerComponent],
  templateUrl: './viewer-route-node-panel.component.html',
  styleUrl: './viewer-route-node-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerRouteNodePanelComponent {
  readonly vmInput = input.required<ViewerRouteNodePanelVm>({ alias: 'vm' });

  readonly close = output<void>();
  readonly setNodeAsStart = output<string>();
  readonly setNodeAsEnd = output<string>();

  readonly xmarkIcon = faXmark;
  readonly startIcon = faFlag;
  readonly endIcon = faLocationDot;

  get vm(): ViewerRouteNodePanelVm {
    return this.vmInput();
  }
}
