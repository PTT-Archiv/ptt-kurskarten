import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faMagnifyingGlass, faRoute } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import { ViewerDayNightIndicatorComponent } from '../day-night-indicator/viewer-day-night-indicator.component';
import type { ViewerHeaderVm } from '../../viewer.models';

@Component({
  selector: 'app-viewer-header',
  standalone: true,
  imports: [TranslocoPipe, FaIconComponent, ViewerDayNightIndicatorComponent],
  templateUrl: './viewer-header.component.html',
  styleUrl: './viewer-header.component.css'
})
export class ViewerHeaderComponent {
  @Input({ required: true }) vm!: ViewerHeaderVm;

  @Output() selectEdition = new EventEmitter<number>();
  @Output() placeSearchFocus = new EventEmitter<void>();
  @Output() placeSearchBlur = new EventEmitter<void>();
  @Output() placeSearchInput = new EventEmitter<string>();
  @Output() placeSearchKeydown = new EventEmitter<KeyboardEvent>();
  @Output() previewPlaceResult = new EventEmitter<{ nodeId: string; index: number }>();
  @Output() selectPlaceResult = new EventEmitter<string>();
  @Output() openRoutePlanner = new EventEmitter<void>();

  readonly searchIcon = faMagnifyingGlass;
  readonly routeIcon = faRoute;
}
