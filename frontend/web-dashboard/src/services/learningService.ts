import { api, ApiResponse } from '@/lib/api';
import type { LearningResource } from '@mercon/shared-types';

export type { TimestampedStep, LearningResource, CreateLearningResourceDTO } from '@mercon/shared-types';

export const learningService = {
  async getResources(): Promise<LearningResource[]> {
    const res = await api.get<ApiResponse<LearningResource[]>>('/learning');
    return res.data.data;
  },

  async getByRoute(route: string): Promise<LearningResource[]> {
    const res = await api.get<ApiResponse<LearningResource[]>>('/learning/by-route', { params: { route } });
    return res.data.data;
  },

  async uploadResource(
    formData: FormData,
    onUploadProgress?: (progressEvent: any) => void
  ): Promise<LearningResource> {
    const res = await api.post<ApiResponse<LearningResource>>('/learning', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
      onUploadProgress,
    });
    return res.data.data;
  },

  async toggleWatched(id: string): Promise<{ watched: boolean }> {
    const res = await api.post<ApiResponse<{ watched: boolean }>>(`/learning/${id}/watch`);
    return res.data.data;
  },

  async deleteResource(id: string): Promise<void> {
    await api.delete(`/learning/${id}`);
  },
};
