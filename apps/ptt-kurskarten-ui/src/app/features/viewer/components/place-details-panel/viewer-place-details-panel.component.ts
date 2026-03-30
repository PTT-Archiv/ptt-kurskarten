import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faFlag, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { ArchiveSnippetViewerComponent } from '@shared-ui/archive/archive-snippet-viewer.component';
import type { ViewerPlaceDetailsVm } from '@viewer/viewer.models';

@Component({
  selector: 'app-viewer-place-details-panel',
  imports: [TranslocoPipe, FaIconComponent, ArchiveSnippetViewerComponent],
  templateUrl: './viewer-place-details-panel.component.html',
  styleUrl: './viewer-place-details-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerPlaceDetailsPanelComponent {
  readonly vmInput = input.required<ViewerPlaceDetailsVm>({ alias: 'vm' });
  readonly showArchivePreviewInput = input(true, { alias: 'showArchivePreview' });

  readonly setNodeAsStart = output<string>();
  readonly setNodeAsEnd = output<string>();

  readonly startIcon = faFlag;
  readonly endIcon = faLocationDot;

  get vm(): ViewerPlaceDetailsVm {
    return this.vmInput();
  }

  get showArchivePreview(): boolean {
    return this.showArchivePreviewInput();
  }
}
