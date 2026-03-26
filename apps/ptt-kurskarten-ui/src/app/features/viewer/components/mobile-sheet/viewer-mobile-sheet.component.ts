import { Component, EventEmitter, Input, Output } from '@angular/core';
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
  standalone: true,
  imports: [
    TranslocoPipe,
    FaIconComponent,
    ViewerRoutePlannerOverlayComponent,
    ViewerResultsPanelComponent,
    ViewerRouteDetailsPanelComponent,
    ViewerPlaceDetailsPanelComponent
  ],
  templateUrl: './viewer-mobile-sheet.component.html',
  styleUrl: './viewer-mobile-sheet.component.css'
})
export class ViewerMobileSheetComponent {
  @Input({ required: true }) vm!: ViewerMobileSheetVm;
  @Input({ required: true }) nodes: Array<{ id: string; name: string }> = [];
  @Input() fromId = '';
  @Input() toId = '';
  @Input() nodeAliases: Record<string, string[]> = {};
  @Input({ required: true }) departTime!: TimeHHMM;
  @Input() showTime = false;
  @Input() canApplyTime = false;
  @Input() searching = false;
  @Input() autoFocusFromToken = 0;

  @Output() cycleSnap = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() openResults = new EventEmitter<void>();
  @Output() fromIdChange = new EventEmitter<string>();
  @Output() toIdChange = new EventEmitter<string>();
  @Output() fromPreviewChange = new EventEmitter<string>();
  @Output() toPreviewChange = new EventEmitter<string>();
  @Output() pickTargetChange = new EventEmitter<'from' | 'to' | null>();
  @Output() departTimeChange = new EventEmitter<TimeHHMM>();
  @Output() applyTime = new EventEmitter<void>();
  @Output() resetSearch = new EventEmitter<void>();
  @Output() swap = new EventEmitter<void>();
  @Output() plannerFocus = new EventEmitter<boolean>();
  @Output() plannerHover = new EventEmitter<boolean>();
  @Output() selectConnection = new EventEmitter<ConnectionOption>();
  @Output() shiftTime = new EventEmitter<number>();
  @Output() setNodeAsStart = new EventEmitter<string>();
  @Output() setNodeAsEnd = new EventEmitter<string>();
  @Output() hoverRouteLeg = new EventEmitter<string | null>();
  @Output() toggleDetailsOnMap = new EventEmitter<boolean>();

  readonly xmarkIcon = faXmark;
}
