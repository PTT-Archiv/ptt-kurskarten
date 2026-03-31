import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faArrowsLeftRight } from '@fortawesome/free-solid-svg-icons';
import type { TimeHHMM } from '@ptt-kurskarten/shared';
import { DEFAULT_DEPART_TIME } from './viewer-route-planner.constants';
import { ViewerRoutePlannerFieldComponent } from './viewer-route-planner-field.component';
import type {
  ViewerRoutePlannerNodeOption,
  ViewerRoutePlannerTarget,
  ViewerRoutePlannerVariant,
} from './viewer-route-planner.models';
import { ViewerRoutePlannerTimeControlsComponent } from './viewer-route-planner-time-controls.component';

@Component({
  selector: 'app-viewer-route-planner-overlay',
  imports: [
    FaIconComponent,
    ViewerRoutePlannerFieldComponent,
    ViewerRoutePlannerTimeControlsComponent,
  ],
  templateUrl: './viewer-route-planner-overlay.component.html',
  styleUrl: './viewer-route-planner-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerRoutePlannerOverlayComponent {
  readonly swapIcon = faArrowsLeftRight;

  readonly variant = input<ViewerRoutePlannerVariant>('full');
  readonly nodes = input.required<ViewerRoutePlannerNodeOption[]>();
  readonly nodeAliases = input<Record<string, string[]>>({});
  readonly fromId = input('');
  readonly toId = input('');
  readonly departTime = input<TimeHHMM>(DEFAULT_DEPART_TIME);
  readonly showTime = input(false);
  readonly canApplyTime = input(false);
  readonly searching = input(false);
  readonly autoFocusFromToken = input(0);

  readonly fromIdChange = output<string>();
  readonly toIdChange = output<string>();
  readonly departTimeChange = output<TimeHHMM>();
  readonly applyTime = output<void>();
  readonly swap = output<void>();
  readonly plannerFocus = output<boolean>();
  readonly plannerHover = output<boolean>();
  readonly fromPreviewChange = output<string>();
  readonly toPreviewChange = output<string>();
  readonly pickTargetChange = output<ViewerRoutePlannerTarget | null>();
  readonly resetSearch = output<void>();

  private activePickTarget: ViewerRoutePlannerTarget | null = null;

  onFieldPickStateChange(target: ViewerRoutePlannerTarget, active: boolean): void {
    if (active) {
      this.activePickTarget = target;
      this.pickTargetChange.emit(target);
      return;
    }

    if (this.activePickTarget === target) {
      this.activePickTarget = null;
      this.pickTargetChange.emit(null);
    }
  }
}
