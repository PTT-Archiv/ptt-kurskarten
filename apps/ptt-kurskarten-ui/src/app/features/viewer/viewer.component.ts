import { AfterViewInit, Component, HostListener, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
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

@Component({
  selector: 'app-viewer',
  standalone: true,
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
  providers: [ViewerFacade],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css',
  encapsulation: ViewEncapsulation.None
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

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    this.facade.onKeydown(event);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.facade.onWindowResize();
  }
}
