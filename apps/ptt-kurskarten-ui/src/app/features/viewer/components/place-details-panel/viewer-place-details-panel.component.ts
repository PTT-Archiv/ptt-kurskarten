import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faFlag, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { ArchiveSnippetViewerComponent } from '../../../../shared/archive/archive-snippet-viewer.component';
import type { ViewerPlaceDetailsVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-place-details-panel',
  standalone: true,
  imports: [TranslocoPipe, FaIconComponent, ArchiveSnippetViewerComponent],
  templateUrl: './viewer-place-details-panel.component.html',
  styleUrl: './viewer-place-details-panel.component.css'
})
export class ViewerPlaceDetailsPanelComponent {
  @Input({ required: true }) vm!: ViewerPlaceDetailsVm;
  @Input() showArchivePreview = true;

  @Output() setNodeAsStart = new EventEmitter<string>();
  @Output() setNodeAsEnd = new EventEmitter<string>();

  readonly startIcon = faFlag;
  readonly endIcon = faLocationDot;
}
