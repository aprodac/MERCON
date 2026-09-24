import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { prisma } from '../db';
import { logger } from '../utils/logger';

export interface WhatsAppServiceConfig {
  apiToken?: string;
  phoneNumberId?: string;
  graphApiVersion?: string;
  publicBaseUrl?: string;
}

export class WhatsAppService {
  private get config(): WhatsAppServiceConfig {
    return {
      apiToken: process.env.WHATSAPP_API_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v19.0',
      publicBaseUrl: process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://dev.mercon.tech',
    };
  }

  /**
   * Check whether WhatsApp Business API credentials are properly configured.
   */
  public isConfigured(): boolean {
    const { apiToken, phoneNumberId } = this.config;
    return Boolean(apiToken && apiToken.trim() && phoneNumberId && phoneNumberId.trim());
  }

  /**
   * Convert an internal relative media path (/uploads/...) into a complete public HTTPS URL.
   */
  public toPublicHttpsUrl(filePath: string): string {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    const publicBase = (this.config.publicBaseUrl || 'https://dev.mercon.tech').replace(/\/+$/, '');
    const cleanPath = filePath.startsWith('/') ? filePath : `/uploads/${filePath}`;
    return `${publicBase}${cleanPath}`;
  }

  /**
   * Upload a local binary file (e.g. video / photo) from local /uploads/ directory to Meta Graph API.
   * Returns Meta media_id.
   */
  public async uploadMedia(filePath: string, mimeType: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('WhatsApp API credentials (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID) are not configured in environment.');
    }

    const { apiToken, phoneNumberId, graphApiVersion } = this.config;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath.replace(/^\//, ''));

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Media file does not exist at local path: ${absolutePath}`);
    }

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', fs.createReadStream(absolutePath), {
      filename: path.basename(absolutePath),
      contentType: mimeType,
    });

    const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/media`;

    try {
      const response = await axios.post(url, formData, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const mediaId = response.data?.id;
      if (!mediaId) {
        throw new Error('Meta API media upload succeeded but returned no media ID.');
      }
      return mediaId;
    } catch (error: any) {
      const metaError = error.response?.data?.error?.message || error.message;
      logger.error({ err: error, metaError }, 'WhatsApp Media Upload Error');
      throw new Error(`Failed to upload media to WhatsApp Cloud API: ${metaError}`);
    }
  }

  /**
   * Send a native media message (video or image) with caption to a recipient phone number via WhatsApp Cloud API.
   */
  public async sendMediaMessage(
    toPhone: string,
    mediaId: string,
    mediaType: 'video' | 'image',
    caption: string
  ): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WhatsApp API credentials (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID) are not configured in environment.');
    }

    const { apiToken, phoneNumberId, graphApiVersion } = this.config;
    const cleanPhone = toPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      throw new Error('Invalid recipient phone number provided for WhatsApp dispatch.');
    }

    const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: mediaType,
      [mediaType]: {
        id: mediaId,
        caption: caption,
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      const metaError = error.response?.data?.error?.message || error.message;
      logger.error({ err: error, metaError }, 'WhatsApp Send Media Message Error');
      throw new Error(`Failed to send ${mediaType} message via WhatsApp Cloud API: ${metaError}`);
    }
  }

  /**
   * Build public media share payload without needing Cloud API credentials (avoids WhatsApp API costs).
   */
  public async buildPublicMediaShare(
    tripId: string,
    options: { category: 'delay' | 'pod'; recipientPhone?: string }
  ): Promise<{
    isCloudApi: boolean;
    publicMediaUrl: string;
    shareText: string;
    recipientPhone: string;
    whatsappWebUrl: string;
  }> {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      include: {
        customer: true,
        driver: true,
        vehicle: true,
        stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' } },
        documents: true,
      },
    });

    if (!trip) {
      throw new Error(`Trip with ID ${tripId} not found.`);
    }

    const targetPhone = options.recipientPhone ||
      trip.customer?.whatsapp_number ||
      trip.customer?.contact_phone ||
      trip.driver?.phone_primary ||
      '';

    const relatedDocs = await prisma.document.findMany({
      where: {
        OR: [
          { entity_type: 'Trip', entity_id: trip.id },
        ],
      },
    });

    const tripRef = trip.ref_id || `TRP-${trip.id.slice(0, 6).toUpperCase()}`;
    const customerName = trip.customer?.name || 'Customer';
    const driverName = trip.driver ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim() : 'Driver Unassigned';
    const driverPhone = trip.driver?.phone_primary || '';

    // Route: first stop → last stop
    const sortedStops = [...(trip.stops || [])].sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
    const originStop = sortedStops[0];
    const destStop = sortedStops[sortedStops.length - 1];
    const origin = (originStop as any)?.location_name || (originStop as any)?.city || 'Origin';
    const destination = (destStop as any)?.location_name || (destStop as any)?.city || 'Destination';

    // Vehicle class & billing type
    const vehicleClass = (trip.vehicle as any)?.vehicle_class || (trip.vehicle as any)?.vehicle_type || '';
    const billingType = (trip as any)?.line_type || (trip as any)?.billing_type || '';
    const vehicleLine = [vehicleClass, billingType].filter(Boolean).join(' - ');

    let relativeFilePath = '';
    let shareText = '';

    if (options.category === 'delay') {
      const videoDoc = relatedDocs.find((d: any) => {
        const fileUrl = String(d.file_url || d.file_path || '').toLowerCase();
        const mime = String(d.mime_type || '').toLowerCase();
        const docType = String(d.doc_type || '').toLowerCase();
        return mime.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(fileUrl) || docType === 'delayevidence';
      });

      relativeFilePath = videoDoc?.file_url || (trip as any).delay_video_url || (trip as any).video_url;
      if (!relativeFilePath) {
        throw new Error(`No delay video evidence file recorded for trip ${tripRef}.`);
      }

      const publicMediaUrl = this.toPublicHttpsUrl(relativeFilePath);
      const publicBase = (this.config.publicBaseUrl || 'https://dev.mercon.tech').replace(/\/+$/, '');
      const galleryUrl = `${publicBase}/trips/evidence-gallery?ref=${encodeURIComponent(tripRef)}`;

      const tripNotes = (trip as any).notes;
      const delayReason = (tripNotes && typeof tripNotes === 'string' && tripNotes.includes('[DELAY REPORT]'))
        ? tripNotes.replace(/^\[DELAY REPORT\]:\s*/i, '').trim()
        : 'Traffic congestion / Operational delay';

      shareText = `🚨 *Delay Report — ${tripRef}*\n\n`;
      shareText += `Customer # ${customerName}\n`;
      shareText += `Route # ${origin} >>> ${destination}\n`;
      if (vehicleLine) shareText += `Vehicle # ${vehicleLine}\n`;
      if (trip.vehicle?.plate_number) shareText += `Truck # *${trip.vehicle.plate_number}*\n`;
      shareText += `Driver # ${driverName}\n`;
      if (driverPhone) shareText += `Number # +${driverPhone.replace(/^\+/, '')}\n`;
      shareText += `Reason # ${delayReason}\n`;
      shareText += `\n📹 *Delay Video*:\n${publicMediaUrl}\n`;
      shareText += `\n🔗 *Full Evidence Gallery*:\n${galleryUrl}`;

      const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
      const whatsappWebUrl = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareText)}`
        : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

      return {
        isCloudApi: false,
        publicMediaUrl,
        shareText,
        recipientPhone: targetPhone,
        whatsappWebUrl,
      };
    } else {
      const podDoc = relatedDocs.find((d: any) => {
        const fileUrl = String(d.file_url || d.file_path || '').toLowerCase();
        const mime = String(d.mime_type || '').toLowerCase();
        const docType = String(d.doc_type || d.category || '').toLowerCase();
        return docType.includes('pod') || docType.includes('proof') || mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(fileUrl);
      });

      relativeFilePath = podDoc?.file_url || (trip as any).pod_photo_url;
      if (!relativeFilePath) {
        throw new Error(`No POD photo file recorded for trip ${tripRef}.`);
      }

      const publicMediaUrl = this.toPublicHttpsUrl(relativeFilePath);
      const publicBase = (this.config.publicBaseUrl || 'https://dev.mercon.tech').replace(/\/+$/, '');
      const galleryUrl = `${publicBase}/trips/evidence-gallery?ref=${encodeURIComponent(tripRef)}`;

      shareText = `✅ *POD Confirmed — ${tripRef}*\n\n`;
      shareText += `Customer # ${customerName}\n`;
      shareText += `Route # ${origin} >>> ${destination}\n`;
      if (vehicleLine) shareText += `Vehicle # ${vehicleLine}\n`;
      if (trip.vehicle?.plate_number) shareText += `Truck # *${trip.vehicle.plate_number}*\n`;
      shareText += `Driver # ${driverName}\n`;
      if (driverPhone) shareText += `Number # +${driverPhone.replace(/^\+/, '')}\n`;
      shareText += `Status # Verified Proof of Delivery\n`;
      shareText += `\n🖼️ *POD Image*:\n${publicMediaUrl}\n`;
      shareText += `\n🔗 *Full Evidence Gallery*:\n${galleryUrl}`;

      const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
      const whatsappWebUrl = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareText)}`
        : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

      return {
        isCloudApi: false,
        publicMediaUrl,
        shareText,
        recipientPhone: targetPhone,
        whatsappWebUrl,
      };
    }
  }

  /**
   * High level workflow to locate trip media file, convert to public HTTPS URL, and dispatch or return sharing link.
   */
  public async shareTripMedia(
    tripId: string,
    options: { category: 'delay' | 'pod'; recipientPhone?: string }
  ): Promise<{
    success: boolean;
    isCloudApi: boolean;
    message: string;
    messageId?: string;
    publicMediaUrl: string;
    shareText: string;
    recipientPhone: string;
    whatsappWebUrl: string;
  }> {
    const publicShare = await this.buildPublicMediaShare(tripId, options);

    // If Meta Cloud API credentials are not configured, return public HTTPS URL share payload directly
    if (!this.isConfigured()) {
      return {
        success: true,
        isCloudApi: false,
        message: 'Public HTTPS media URL generated for WhatsApp dispatch',
        publicMediaUrl: publicShare.publicMediaUrl,
        shareText: publicShare.shareText,
        recipientPhone: publicShare.recipientPhone,
        whatsappWebUrl: publicShare.whatsappWebUrl,
      };
    }

    // If Cloud API credentials ARE configured, dispatch natively via Meta API as well
    try {
      const relativeFilePath = publicShare.publicMediaUrl.replace((this.config.publicBaseUrl || '').replace(/\/+$/, ''), '');
      const mimeType = options.category === 'delay' ? 'video/mp4' : 'image/jpeg';
      const mediaType = options.category === 'delay' ? 'video' : 'image';

      const mediaId = await this.uploadMedia(relativeFilePath, mimeType);
      const res = await this.sendMediaMessage(publicShare.recipientPhone, mediaId, mediaType, publicShare.shareText);

      return {
        success: true,
        isCloudApi: true,
        message: `Media natively dispatched to WhatsApp (${publicShare.recipientPhone})`,
        messageId: res?.messages?.[0]?.id,
        publicMediaUrl: publicShare.publicMediaUrl,
        shareText: publicShare.shareText,
        recipientPhone: publicShare.recipientPhone,
        whatsappWebUrl: publicShare.whatsappWebUrl,
      };
    } catch (err: any) {
      logger.warn({ err }, 'Cloud API dispatch failed, falling back to public HTTPS WhatsApp Web URL');
      return {
        success: true,
        isCloudApi: false,
        message: 'Cloud API error; generated public HTTPS media URL for WhatsApp web dispatch',
        publicMediaUrl: publicShare.publicMediaUrl,
        shareText: publicShare.shareText,
        recipientPhone: publicShare.recipientPhone,
        whatsappWebUrl: publicShare.whatsappWebUrl,
      };
    }
  }
}

export const whatsappService = new WhatsAppService();
