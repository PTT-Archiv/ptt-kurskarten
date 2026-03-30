import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectionOption } from '@ptt-kurskarten/shared';
import type { ViewerResultsVm } from '@viewer/viewer.models';

@Component({
  selector: 'app-viewer-results-panel',
  imports: [TranslocoPipe],
  templateUrl: './viewer-results-panel.component.html',
  styleUrl: './viewer-results-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerResultsPanelComponent {
  readonly vmInput = input.required<ViewerResultsVm>({ alias: 'vm' });

  readonly selectConnection = output<ConnectionOption>();
  readonly shiftTime = output<number>();

  get vm(): ViewerResultsVm {
    return this.vmInput();
  }
}
