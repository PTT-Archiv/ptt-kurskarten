import { Routes } from '@angular/router';
import {
  ADMIN_GRAPH_REPOSITORY,
  DemoGraphRepository,
  HttpGraphRepository
} from '@admin/admin-graph.repository';
import { environment } from '@env/environment';

const fullRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('@viewer/viewer.component').then((m) => m.ViewerComponent)
  },
  {
    path: 'connections',
    loadComponent: () => import('@connections/connections.component').then((m) => m.ConnectionsComponent)
  },
  {
    path: 'reports',
    loadComponent: () => import('@reports/reports.component').then((m) => m.ReportsComponent)
  },
  {
    path: 'admin/tutorial',
    loadComponent: () => import('@admin/admin.component').then((m) => m.AdminComponent),
    providers: [{ provide: ADMIN_GRAPH_REPOSITORY, useClass: DemoGraphRepository }]
  },
  {
    path: 'admin',
    loadComponent: () => import('@admin/admin.component').then((m) => m.AdminComponent),
    providers: [{ provide: ADMIN_GRAPH_REPOSITORY, useClass: HttpGraphRepository }]
  }
];

const readonlyRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('@viewer/viewer.component').then((m) => m.ViewerComponent)
  }
];

export const routes: Routes = [
  ...(environment.readonlyViewer ? readonlyRoutes : fullRoutes),
  { path: '**', redirectTo: '' }
];
