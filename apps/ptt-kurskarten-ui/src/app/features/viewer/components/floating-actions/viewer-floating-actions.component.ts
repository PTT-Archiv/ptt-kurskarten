import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faGear, faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ViewerFloatingActionsVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-floating-actions',
  imports: [TranslocoPipe, FaIconComponent, RouterLink],
  templateUrl: './viewer-floating-actions.component.html',
  styleUrl: './viewer-floating-actions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerFloatingActionsComponent {
  readonly vmInput = input.required<ViewerFloatingActionsVm>({ alias: 'vm' });

  readonly toggleHelp = output<void>();
  readonly toggleSettings = output<void>();
  readonly closeHelp = output<void>();
  readonly closeSettings = output<void>();
  readonly toggleSurfaceMode = output<void>();
  readonly resetMapView = output<void>();
  readonly setLang = output<'de' | 'fr'>();
  readonly tripFlowNodeModeChange = output<string>();
  readonly tripFlowEdgeModeChange = output<string>();

  readonly xmarkIcon = faXmark;
  readonly gearIcon = faGear;

  get vm(): ViewerFloatingActionsVm {
    return this.vmInput();
  }
}
