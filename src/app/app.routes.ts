import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { BeerManagementComponent } from './features/beer-management/beer-management';
import { SalesFormComponent } from './features/sales-form/sales-form';
import { Menu } from './features/menu/menu';

export const routes: Routes = [
   {
    path: '',
   component: LoginComponent
   },
   {
    path: 'menu',
    component: Menu
   }
];
