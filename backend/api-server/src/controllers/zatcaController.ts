import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { logAuditEvent } from '../services/auditService';
import { activateProduction, connectWithOtp, getZatcaConfig, resetConnection, saveProfile, toStatus, ZatcaOnboardingError } from '../services/zatca/onboarding';
import { ZatcaApiError } from '../services/zatca/zatcaApi';
import { DataKeyMissingError, DataKeyUnavailableError } from '../services/secrets/secretBox';

function sendError(res: Response, err: unknown) {
  if (err instanceof ZatcaOnboardingError) {
    return res.status(err.httpStatus).json({ success: false, error: { code: err.code, message: err.message } });
  }
  if (err instanceof ZatcaApiError) {
    // ZATCA said no (bad OTP, invalid CSR…) or couldn't be reached. 4xx, not
    // 502: the dashboard hides 5xx messages, and this one is meant to be read.
    return res.status(422).json({ success: false, error: { code: 'ZATCA_REJECTED', message: err.message } });
  }
  if (err instanceof DataKeyMissingError) {
    return res.status(409).json({ success: false, error: { code: 'DATA_KEY_MISSING', message: err.message } });
  }
  if (err instanceof DataKeyUnavailableError) {
    return res.status(409).json({
      success: false,
      error: { code: 'DATA_KEY_UNAVAILABLE', message: 'The stored ZATCA certificate can’t be read on this server (its encryption key changed). Reset the connection and connect again.' },
    });
  }
  console.error('[zatca]', err);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'ZATCA setup failed unexpectedly' } });
}

export const getZatcaStatus = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, data: toStatus(await getZatcaConfig()) });
  } catch (err) {
    sendError(res, err);
  }
};

export const updateZatcaProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await saveProfile(req.body, req.user?.id);
    await logAuditEvent({ req, action: 'ZATCA_PROFILE_SAVED', entityType: 'ZatcaConfig', entityId: config.id, metadata: { environment: config.environment, vatNumber: config.vatNumber } });
    res.json({ success: true, data: toStatus(config) });
  } catch (err) {
    sendError(res, err);
  }
};

export const connectZatca = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await connectWithOtp(req.body.otp, req.user?.id);
    await logAuditEvent({ req, action: 'ZATCA_COMPLIANCE_CERTIFICATE_ISSUED', entityType: 'ZatcaConfig', entityId: config.id, metadata: { environment: config.environment } });
    res.json({ success: true, data: toStatus(config) });
  } catch (err) {
    sendError(res, err);
  }
};

export const activateZatcaProduction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await activateProduction(req.user?.id);
    await logAuditEvent({ req, action: 'ZATCA_PRODUCTION_CERTIFICATE_ISSUED', entityType: 'ZatcaConfig', entityId: config.id, metadata: { environment: config.environment } });
    res.json({ success: true, data: toStatus(config) });
  } catch (err) {
    sendError(res, err);
  }
};

export const resetZatca = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await resetConnection({ userId: req.user?.id, isSuperAdmin: req.user?.isSuperAdmin === true || req.user?.role === 'SuperAdmin' });
    await logAuditEvent({ req, action: 'ZATCA_CONNECTION_RESET', entityType: 'ZatcaConfig', entityId: config.id, metadata: { environment: config.environment } });
    res.json({ success: true, data: toStatus(config) });
  } catch (err) {
    sendError(res, err);
  }
};
