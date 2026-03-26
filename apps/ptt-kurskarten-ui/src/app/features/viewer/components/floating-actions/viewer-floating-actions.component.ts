import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faGear, faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ViewerFloatingActionsVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-floating-actions',
  standalone: true,
  imports: [TranslocoPipe, FaIconComponent, RouterLink],
  templateUrl: './viewer-floating-actions.component.html',
  styleUrl: './viewer-floating-actions.component.css'
})
export class ViewerFloatingActionsComponent {
  @Input({ required: true }) vm!: ViewerFloatingActionsVm;

  @Output() toggleHelp = new EventEmitter<void>();
  @Output() toggleSettings = new EventEmitter<void>();
  @Output() closeHelp = new EventEmitter<void>();
  @Output() closeSettings = new EventEmitter<void>();
  @Output() toggleSurfaceMode = new EventEmitter<void>();
  @Output() resetMapView = new EventEmitter<void>();
  @Output() setLang = new EventEmitter<'de' | 'fr'>();
  @Output() tripFlowNodeModeChange = new EventEmitter<string>();
  @Output() tripFlowEdgeModeChange = new EventEmitter<string>();

  readonly xmarkIcon = faXmark;
  readonly gearIcon = faGear;
}
