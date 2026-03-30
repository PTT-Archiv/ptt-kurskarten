import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faMagnifyingGlass, faRoute } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import { ViewerDayNightIndicatorComponent } from '../day-night-indicator/viewer-day-night-indicator.component';
import type { ViewerHeaderVm } from '@viewer/viewer.models';

@Component({
  selector: 'app-viewer-header',
  imports: [TranslocoPipe, FaIconComponent, ViewerDayNightIndicatorComponent],
  templateUrl: './viewer-header.component.html',
  styleUrl: './viewer-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerHeaderComponent {
  readonly vmInput = input.required<ViewerHeaderVm>({ alias: 'vm' });

  readonly selectEdition = output<number>();
  readonly placeSearchFocus = output<void>();
  readonly placeSearchBlur = output<void>();
  readonly placeSearchInput = output<string>();
  readonly placeSearchKeydown = output<KeyboardEvent>();
  readonly previewPlaceResult = output<{ nodeId: string; index: number }>();
  readonly selectPlaceResult = output<string>();
  readonly openRoutePlanner = output<void>();

  readonly searchIcon = faMagnifyingGlass;
  readonly routeIcon = faRoute;

  get vm(): ViewerHeaderVm {
    return this.vmInput();
  }
}
