/**
 * Notifications API layer — the signed-in operator's in-app notifications,
 * same endpoints the web dashboard uses (Admin/Operator only):
 *   GET   /notifications          → 50 most recent, newest first
 *   PATCH /notifications/:id/read → mark one as read
 */
import { api } from '@mercon/mobile-shared/lib/api';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';

export const notificationsApi = {
  async list(): Promise<AppNotification[]> {
    const { data } = await api.get('/notifications');
    return (data.data ?? []) as AppNotification[];
  },

  async markRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`);
  },
};
