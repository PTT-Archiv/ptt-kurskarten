import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectionOption } from '@ptt-kurskarten/shared';
import type { ViewerResultsVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-results-panel',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './viewer-results-panel.component.html',
  styleUrl: './viewer-results-panel.component.css'
})
export class ViewerResultsPanelComponent {
  @Input({ required: true }) vm!: ViewerResultsVm;

  @Output() selectConnection = new EventEmitter<ConnectionOption>();
  @Output() shiftTime = new EventEmitter<number>();
}
