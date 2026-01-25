import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard de Autenticacao
 *
 * Protege rotas que precisam de usuario logado.
 * Se nao estiver logado, redireciona para /login
 *
 * COMO USAR:
 * {
 *   path: 'beer-management',
 *   canActivate: [authGuard],
 *   component: BeerManagementComponent
 * }
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Verifica se usuario esta logado
  if (authService.isAuthenticated()) {
    return true; // Permite acesso
  }

  // Salva a URL que o usuario tentou acessar
  // Apos login, sera redirecionado de volta
  const returnUrl = state.url;

  // Redireciona para login com returnUrl
  router.navigate(['/login'], {
    queryParams: { returnUrl }
  });

  return false; // Bloqueia acesso
};
