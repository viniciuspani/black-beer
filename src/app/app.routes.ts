import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { Menu } from './features/menu/menu';

export const routes: Routes = [
   {
    path: '',
   component: LoginComponent
   },
   {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent),
    title: 'Login - Black Beer'
  },
   {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component'),
    title: 'Criar Conta - Black Beer'
  },
   {
    path: 'menu',
    component: Menu
   }
];
