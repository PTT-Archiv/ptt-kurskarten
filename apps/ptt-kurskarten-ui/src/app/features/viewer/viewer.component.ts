import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import { MapStageComponent } from '../../shared/map/map-stage.component';
import { ViewerArchiveStageComponent } from './components/archive-stage/viewer-archive-stage.component';
import { ViewerRoutePlannerOverlayComponent } from './components/route-planner-overlay/viewer-route-planner-overlay.component';
import { ViewerFacade } from './viewer.facade';
import { ViewerHeaderComponent } from './components/header/viewer-header.component';
import { ViewerFloatingActionsComponent } from './components/floating-actions/viewer-floating-actions.component';
import { ViewerSidebarComponent } from './components/sidebar/viewer-sidebar.component';
import { ViewerRouteNodePanelComponent } from './components/route-node-panel/viewer-route-node-panel.component';
import { ViewerMobileSheetComponent } from './components/mobile-sheet/viewer-mobile-sheet.component';
import { ViewerCoreStore } from './stores/viewer-core.store';
import { ViewerRoutingStore } from './stores/viewer-routing.store';
import { ViewerSearchStore } from './stores/viewer-search.store';
import { ViewerLayoutStore } from './stores/viewer-layout.store';
import { ViewerArchiveStore } from './stores/viewer-archive.store';
import { ViewerSimulationStore } from './stores/viewer-simulation.store';

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
