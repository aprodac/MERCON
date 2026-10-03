import { api, ApiResponse } from '@/lib/api';
import { authStore, AuthUser } from '@/store/authStore';

export interface LoginPayload {
  username: string;
  password: string;
}
export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export const authService = {
  /** `remember`: keep me signed in on this browser (else until the browser closes). */
  async login(payload: LoginPayload, remember = true): Promise<LoginResult> {
    try {
      const res = await api.post<ApiResponse<LoginResult>>('/auth/login', payload);
      const { token, user } = res.data.data;
      authStore.setSession(token, user, remember);
      return res.data.data;
    } catch (err: any) {
      if (import.meta.env.DEV && (!err.response || err.response.status >= 500 || err.code === 'ERR_NETWORK')) {
        const mockUser: AuthUser = {
          id: 'user-admin-001',
          name: payload.username ? (payload.username.charAt(0).toUpperCase() + payload.username.slice(1)) : 'Ilan',
          email: `${payload.username || 'admin'}@mercon.tech`,
          username: payload.username || 'admin',
          role: 'Admin',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any;

        const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXItMDAxIiwicm9sZSI6IkFkbWluIiwiZXhwIjoyNTMzNTE5ODAwMH0.mock';
        const mockResult: LoginResult = {
          token: mockToken,
          expires_at: new Date(Date.now() + 864000000).toISOString(),
          user: mockUser,
        };
        authStore.setSession(mockResult.token, mockResult.user, remember);
        return mockResult;
      }
      throw err;
    }
  },

  async getMe(): Promise<AuthUser> {
    const res = await api.get<ApiResponse<AuthUser>>('/auth/me');
    return res.data.data;
  },

  async updateMe(payload: { name?: string; email?: string; phone?: string }): Promise<AuthUser> {
    const res = await api.patch<ApiResponse<AuthUser>>('/auth/me', payload);
    const current = authStore.getUser();
    if (current) authStore.setSession(authStore.getToken()!, { ...current, ...res.data.data });
    return res.data.data;
  },

  async changePassword(current_password: string, new_password: string): Promise<void> {
    await api.post('/auth/change-password', { current_password, new_password });
  },

  /** Notify all operators/admins that this user needs a password reset. */
  async requestPasswordReset(identifier: string): Promise<void> {
    await api.post('/auth/request-reset', { identifier });
  },

  logout() {
    authStore.clearSession();
    window.location.href = '/login';
  },
};
