/**
 * Operator sign-in for the shared <AuthProvider> (@mercon/mobile-shared/lib/auth-context).
 * Operators and Admins log in with username (or phone) + password via
 * POST /auth/login. Driver accounts are turned away — drivers use the
 * Mercon Driver app.
 */
import { api, UserFacingError } from '@mercon/mobile-shared/lib/api';
import { translate } from '@mercon/mobile-shared/lib/language-context';
import type { Role, SignInStrategy } from '@mercon/mobile-shared/lib/auth-context';

export const OPERATOR_APP_ROLES: Role[] = ['Operator', 'Admin'];

export const signInOperator: SignInStrategy = async (username, password) => {
  const { data } = await api.post('/auth/login', { username, password });
  const { token, user } = data.data;
  if (!OPERATOR_APP_ROLES.includes(user.role)) {
    throw new UserFacingError(
      translate('err_use_driver_app', 'This is a driver account. Please sign in with the Mercon Driver app.'),
    );
  }
  return {
    token,
    session: { role: user.role, profile: { id: user.id, name: user.name, username: user.username } },
  };
};
