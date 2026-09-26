import { api } from '@/lib/api';

export interface TrashItem {
  id: string;
  type: string;
  name: string;
  deletedAt: string;
}

export const trashService = {
  async getAll(): Promise<TrashItem[]> {
    const res = await api.get<{ success: boolean; data: TrashItem[] }>('/trash');
    return res.data.data;
  },

  async restore(type: string, id: string): Promise<void> {
    await api.post(`/trash/${type}/${id}/restore`);
  },

  async permanentDelete(type: string, id: string): Promise<void> {
    await api.delete(`/trash/${type}/${id}`);
  },
};
