import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faFlag, faLocationDot, faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ViewerRouteNodePanelVm } from '../../viewer.models';
import { ArchiveSnippetViewerComponent } from '../../../../shared/archive/archive-snippet-viewer.component';

@Component({
  selector: 'app-viewer-route-node-panel',
  standalone: true,
  imports: [TranslocoPipe, FaIconComponent, ArchiveSnippetViewerComponent],
  templateUrl: './viewer-route-node-panel.component.html',
  styleUrl: './viewer-route-node-panel.component.css'
})
export class ViewerRouteNodePanelComponent {
  @Input({ required: true }) vm!: ViewerRouteNodePanelVm;

  @Output() close = new EventEmitter<void>();
  @Output() setNodeAsStart = new EventEmitter<string>();
  @Output() setNodeAsEnd = new EventEmitter<string>();

  readonly xmarkIcon = faXmark;
  readonly startIcon = faFlag;
  readonly endIcon = faLocationDot;
}
