import { z } from 'zod';

const trimmed = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);
const optionalTrimmed = (max = 200) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());

/**
 * Seller profile for ZATCA onboarding. Formats follow ZATCA's validation rules
 * (VAT: 15 digits, first and last digit 3; national address: 4-digit building
 * number, 5-digit postal code).
 */
export const zatcaProfileBody = z
  .object({
    environment: z.enum(['Sandbox', 'Simulation', 'Production']),
    sellerNameAr: trimmed('Arabic seller name'),
    sellerNameEn: optionalTrimmed(),
    vatNumber: z.string().trim().regex(/^3\d{13}3$/, 'VAT number must be 15 digits, starting and ending with 3'),
    crNumber: z.string().trim().regex(/^\d{10}$/, 'CR number must be 10 digits'),
    branchName: trimmed('Branch name', 100),
    businessCategory: trimmed('Business category', 100),
    invoiceTypes: z.enum(['1000', '0100', '1100']),
    buildingNumber: z.string().trim().regex(/^\d{4}$/, 'Building number must be 4 digits'),
    streetName: trimmed('Street'),
    district: trimmed('District'),
    city: trimmed('City', 100),
    postalCode: z.string().trim().regex(/^\d{5}$/, 'Postal code must be 5 digits'),
    additionalNumber: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().regex(/^\d{4}$/, 'Additional number must be 4 digits').optional(),
    ),
    shortAddress: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.toUpperCase() : v),
      z.string().trim().regex(/^[A-Z]{4}\d{4}$/, 'Short address looks like RRRD2929 (4 letters, 4 digits)').optional(),
    ),
  })
  .superRefine((body, ctx) => {
    // VAT groups (11th digit 1) must put the 10-digit TIN in the CSR organisation unit.
    if (body.vatNumber[10] === '1' && !/^\d{10}$/.test(body.branchName)) {
      ctx.addIssue({
        code: 'custom',
        path: ['branchName'],
        message: 'This is a VAT group number — enter the group member’s 10-digit TIN as the branch',
      });
    }
  });

export type ZatcaProfileInput = z.infer<typeof zatcaProfileBody>;

export const zatcaConnectBody = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'The OTP is 6 digits'),
});

export const zatcaResetBody = z.object({
  confirm: z.literal('RESET', { message: 'Type RESET to confirm' }),
});
