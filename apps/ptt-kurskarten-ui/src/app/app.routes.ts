import { Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { ConnectionsComponent } from './connections.component';
import { ReportsComponent } from './reports.component';
import { ViewerComponent } from './viewer.component';
import { ADMIN_GRAPH_REPOSITORY, DemoGraphRepository, HttpGraphRepository } from './admin-graph.repository';
import { environment } from '../environments/environment';

const fullRoutes: Routes = [
  { path: '', component: ViewerComponent },
  { path: 'connections', component: ConnectionsComponent },
  { path: 'reports', component: ReportsComponent },
  {
    path: 'admin/tutorial',
    component: AdminComponent,
    providers: [{ provide: ADMIN_GRAPH_REPOSITORY, useClass: DemoGraphRepository }]
  },
  {
    path: 'admin',
    component: AdminComponent,
    providers: [{ provide: ADMIN_GRAPH_REPOSITORY, useClass: HttpGraphRepository }]
  }
];

const readonlyRoutes: Routes = [{ path: '', component: ViewerComponent }];

export const routes: Routes = [
  ...(environment.readonlyViewer ? readonlyRoutes : fullRoutes),
  { path: '**', redirectTo: '' }
];
