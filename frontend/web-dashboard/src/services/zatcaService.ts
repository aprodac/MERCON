import { api, ApiResponse } from '@/lib/api';
import type { ZatcaEnvironment, ZatcaInvoiceTypes, ZatcaStatus } from '@mercon/shared-types';

export interface ZatcaProfileForm {
  environment: ZatcaEnvironment;
  sellerNameAr: string;
  sellerNameEn: string;
  vatNumber: string;
  crNumber: string;
  branchName: string;
  businessCategory: string;
  invoiceTypes: ZatcaInvoiceTypes;
  buildingNumber: string;
  streetName: string;
  district: string;
  city: string;
  postalCode: string;
  additionalNumber: string;
  shortAddress: string;
}

export const zatcaService = {
  async getStatus(): Promise<ZatcaStatus> {
    const res = await api.get<ApiResponse<ZatcaStatus>>('/zatca');
    return res.data.data!;
  },

  async saveProfile(profile: ZatcaProfileForm): Promise<ZatcaStatus> {
    const res = await api.put<ApiResponse<ZatcaStatus>>('/zatca/profile', profile);
    return res.data.data!;
  },

  async connect(otp: string): Promise<ZatcaStatus> {
    const res = await api.post<ApiResponse<ZatcaStatus>>('/zatca/connect', { otp });
    return res.data.data!;
  },

  async activateProduction(): Promise<ZatcaStatus> {
    const res = await api.post<ApiResponse<ZatcaStatus>>('/zatca/production');
    return res.data.data!;
  },

  async reset(): Promise<ZatcaStatus> {
    const res = await api.post<ApiResponse<ZatcaStatus>>('/zatca/reset', { confirm: 'RESET' });
    return res.data.data!;
  },
};

/** Per-field messages from the backend's 400 VALIDATION_ERROR envelope. */
export function fieldErrorsFrom(error: any): Record<string, string> {
  const details = error?.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((d: { path: string; message: string }) => [d.path, d.message]));
}
