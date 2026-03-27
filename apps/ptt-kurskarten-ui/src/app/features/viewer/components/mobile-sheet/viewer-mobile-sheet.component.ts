import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectionOption, TimeHHMM } from '@ptt-kurskarten/shared';
import type { ViewerMobileSheetVm } from '../../viewer.models';
import { ViewerRoutePlannerOverlayComponent } from '../route-planner-overlay/viewer-route-planner-overlay.component';
import { ViewerResultsPanelComponent } from '../results-panel/viewer-results-panel.component';
import { ViewerRouteDetailsPanelComponent } from '../route-details-panel/viewer-route-details-panel.component';
import { ViewerPlaceDetailsPanelComponent } from '../place-details-panel/viewer-place-details-panel.component';

@Component({
  selector: 'app-viewer-mobile-sheet',
  imports: [
    TranslocoPipe,
    FaIconComponent,
    ViewerRoutePlannerOverlayComponent,
    ViewerResultsPanelComponent,
    ViewerRouteDetailsPanelComponent,
    ViewerPlaceDetailsPanelComponent
  ],
  templateUrl: './viewer-mobile-sheet.component.html',
  styleUrl: './viewer-mobile-sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerMobileSheetComponent {
  readonly vmInput = input.required<ViewerMobileSheetVm>({ alias: 'vm' });
  readonly nodesInput = input.required<Array<{ id: string; name: string }>>({ alias: 'nodes' });
  readonly fromIdInput = input('', { alias: 'fromId' });
  readonly toIdInput = input('', { alias: 'toId' });
  readonly nodeAliasesInput = input<Record<string, string[]>>({}, { alias: 'nodeAliases' });
  readonly departTimeInput = input.required<TimeHHMM>({ alias: 'departTime' });
  readonly showTimeInput = input(false, { alias: 'showTime' });
  readonly canApplyTimeInput = input(false, { alias: 'canApplyTime' });
  readonly searchingInput = input(false, { alias: 'searching' });
  readonly autoFocusFromTokenInput = input(0, { alias: 'autoFocusFromToken' });

  readonly cycleSnap = output<void>();
  readonly close = output<void>();
  readonly openResults = output<void>();
  readonly fromIdChange = output<string>();
  readonly toIdChange = output<string>();
  readonly fromPreviewChange = output<string>();
  readonly toPreviewChange = output<string>();
  readonly pickTargetChange = output<'from' | 'to' | null>();
  readonly departTimeChange = output<TimeHHMM>();
  readonly applyTime = output<void>();
  readonly resetSearch = output<void>();
  readonly swap = output<void>();
  readonly plannerFocus = output<boolean>();
  readonly plannerHover = output<boolean>();
  readonly selectConnection = output<ConnectionOption>();
  readonly shiftTime = output<number>();
  readonly setNodeAsStart = output<string>();
  readonly setNodeAsEnd = output<string>();
  readonly hoverRouteLeg = output<string | null>();
  readonly toggleDetailsOnMap = output<boolean>();

  readonly xmarkIcon = faXmark;

  get vm(): ViewerMobileSheetVm {
    return this.vmInput();
  }

  get nodes(): Array<{ id: string; name: string }> {
    return this.nodesInput();
  }

  get fromId(): string {
    return this.fromIdInput();
  }

  get toId(): string {
    return this.toIdInput();
  }

  get nodeAliases(): Record<string, string[]> {
    return this.nodeAliasesInput();
  }

  get departTime(): TimeHHMM {
    return this.departTimeInput();
  }

  get showTime(): boolean {
    return this.showTimeInput();
  }

  get canApplyTime(): boolean {
    return this.canApplyTimeInput();
  }

  get searching(): boolean {
    return this.searchingInput();
  }

  get autoFocusFromToken(): number {
    return this.autoFocusFromTokenInput();
  }
}
