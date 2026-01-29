import { Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { ConnectionsComponent } from './connections.component';
import { ViewerComponent } from './viewer.component';

export const routes: Routes = [
  { path: '', component: ViewerComponent },
  { path: 'connections', component: ConnectionsComponent },
  { path: 'admin', component: AdminComponent }
];
