import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import type { TimeHHMM } from '@ptt-kurskarten/shared';
import { ViewerRoutePlannerOverlayComponent } from '../route-planner-overlay/viewer-route-planner-overlay.component';

@Component({
  selector: 'app-viewer-desktop-planner',
  imports: [TranslocoPipe, FaIconComponent, ViewerRoutePlannerOverlayComponent],
  templateUrl: './viewer-desktop-planner.component.html',
  styleUrl: './viewer-desktop-planner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerDesktopPlannerComponent {
  readonly nodesInput = input.required<Array<{ id: string; name: string }>>({ alias: 'nodes' });
  readonly fromIdInput = input('', { alias: 'fromId' });
  readonly toIdInput = input('', { alias: 'toId' });
  readonly nodeAliasesInput = input<Record<string, string[]>>({}, { alias: 'nodeAliases' });
  readonly departTimeInput = input.required<TimeHHMM>({ alias: 'departTime' });
  readonly showTimeInput = input(false, { alias: 'showTime' });
  readonly canApplyTimeInput = input(false, { alias: 'canApplyTime' });
  readonly searchingInput = input(false, { alias: 'searching' });
  readonly noResultsMessageInput = input('', { alias: 'noResultsMessage' });
  readonly autoFocusFromTokenInput = input(0, { alias: 'autoFocusFromToken' });

  readonly close = output<void>();
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

  readonly xmarkIcon = faXmark;

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

  get noResultsMessage(): string {
    return this.noResultsMessageInput();
  }

  get autoFocusFromToken(): number {
    return this.autoFocusFromTokenInput();
  }
}
