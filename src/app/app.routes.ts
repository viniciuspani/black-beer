import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  // ========================================
  // ROTAS PUBLICAS (sem autenticacao)
  // ========================================
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent),
    title: 'Login - Black Beer'
  },

  // ========================================
  // ROTAS PROTEGIDAS (precisa estar logado)
  // ========================================
  {
    path: 'menu',
    canActivate: [authGuard],
    loadComponent: () => import('./features/menu/menu').then(m => m.Menu),
    title: 'Menu - Black Beer'
  },

  // ========================================
  // ROTA 404 (qualquer caminho invalido)
  // ========================================
  {
    path: '**',
    redirectTo: '/login'
  }
];
