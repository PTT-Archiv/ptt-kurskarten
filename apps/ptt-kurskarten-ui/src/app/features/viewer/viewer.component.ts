import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import { MapStageComponent } from '@shared-ui/map/map-stage.component';
import { ViewerArchiveStageComponent } from '@viewer/components/archive-stage/viewer-archive-stage.component';
import { ViewerRoutePlannerOverlayComponent } from '@viewer/components/route-planner-overlay/viewer-route-planner-overlay.component';
import { ViewerFacade } from '@viewer/viewer.facade';
import { ViewerHeaderComponent } from '@viewer/components/header/viewer-header.component';
import { ViewerFloatingActionsComponent } from '@viewer/components/floating-actions/viewer-floating-actions.component';
import { ViewerSidebarComponent } from '@viewer/components/sidebar/viewer-sidebar.component';
import { ViewerRouteNodePanelComponent } from '@viewer/components/route-node-panel/viewer-route-node-panel.component';
import { ViewerMobileSheetComponent } from '@viewer/components/mobile-sheet/viewer-mobile-sheet.component';
import { ViewerCoreStore } from '@viewer/stores/viewer-core.store';
import { ViewerRoutingStore } from '@viewer/stores/viewer-routing.store';
import { ViewerSearchStore } from '@viewer/stores/viewer-search.store';
import { ViewerLayoutStore } from '@viewer/stores/viewer-layout.store';
import { ViewerArchiveStore } from '@viewer/stores/viewer-archive.store';
import { ViewerSimulationStore } from '@viewer/stores/viewer-simulation.store';

@Component({
  selector: 'app-viewer',
  imports: [
    TranslocoPipe,
    FaIconComponent,
    MapStageComponent,
    ViewerArchiveStageComponent,
    ViewerRoutePlannerOverlayComponent,
    ViewerHeaderComponent,
    ViewerFloatingActionsComponent,
    ViewerSidebarComponent,
    ViewerRouteNodePanelComponent,
    ViewerMobileSheetComponent
  ],
  providers: [
    ViewerCoreStore,
    ViewerRoutingStore,
    ViewerSearchStore,
    ViewerArchiveStore,
    ViewerLayoutStore,
    ViewerSimulationStore,
    ViewerFacade
  ],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onWindowKeydown($event)',
    '(window:resize)': 'onWindowResize()'
  }
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  readonly facade = inject(ViewerFacade);
  readonly xmarkIcon = faXmark;

  ngAfterViewInit(): void {
    this.facade.afterViewInit();
  }

  ngOnDestroy(): void {
    this.facade.destroy();
  }

  onWindowKeydown(event: KeyboardEvent): void {
    this.facade.onKeydown(event);
  }

  onWindowResize(): void {
    this.facade.onWindowResize();
  }
}
