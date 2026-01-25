import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard de Administrador
 *
 * Protege rotas exclusivas para usuarios com role 'admin'.
 * Se nao for admin, redireciona para home
 *
 * IMPORTANTE: Este guard DEVE ser usado junto com authGuard
 *
 * COMO USAR:
 * {
 *   path: 'admin-settings',
 *   canActivate: [authGuard, adminGuard], // authGuard primeiro!
 *   component: AdminSettingsComponent
 * }
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Verifica se o usuario esta logado E eh admin
  if (authService.isAuthenticated() && authService.isAdmin()) {
    return true; // Permite acesso
  }

  // Se nao for admin, redireciona para home
  console.warn('Acesso negado: usuario nao eh administrador');
  router.navigate(['/']);

  return false; // Bloqueia acesso
};
