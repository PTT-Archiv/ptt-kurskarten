import { Routes } from '@angular/router';
import { ADMIN_GRAPH_REPOSITORY, DemoGraphRepository, HttpGraphRepository } from './features/admin/admin-graph.repository';
import { environment } from '../environments/environment';

const fullRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/viewer/viewer.component').then((m) => m.ViewerComponent)
  },
  {
    path: 'connections',
    loadComponent: () => import('./features/connections/connections.component').then((m) => m.ConnectionsComponent)
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent)
  },
  {
    path: 'admin/tutorial',
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
    providers: [{ provide: ADMIN_GRAPH_REPOSITORY, useClass: DemoGraphRepository }]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
    providers: [{ provide: ADMIN_GRAPH_REPOSITORY, useClass: HttpGraphRepository }]
  }
];

const readonlyRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/viewer/viewer.component').then((m) => m.ViewerComponent)
  }
];

export const routes: Routes = [
  ...(environment.readonlyViewer ? readonlyRoutes : fullRoutes),
  { path: '**', redirectTo: '' }
];
