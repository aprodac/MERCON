import { Trip } from '@/services/tripService';
import { toast } from 'sonner';
import { tripStatusMessage, tripsStatusMessage } from '@/utils/statusMessage';

/**
 * One trip's WhatsApp status — the one shared format (utils/statusMessage →
 * @mercon/shared-types), the same the trip page and the operator app send.
 */
export function formatSingleTripWhatsappMessage(trip: Trip, withTailgate = false, trackingUrl?: string | null, tz?: string): string {
  return tripStatusMessage(trip, tz, trackingUrl, withTailgate ? ['WITH TAILGATE'] : undefined);
}

/** Several trips in one message: one block per customer, each trip numbered with its own live link. */
export function formatMultipleTripsWhatsappMessage(trips: Trip[], links: Record<string, string | null> = {}, tz?: string): string {
  if (!trips || trips.length === 0) return '';
  return tripsStatusMessage(trips, tz, links);
}

/**
 * Triggers WhatsApp messages for an array of selected trips.
 * Supports combined mode (recommended: 1 window with formatted summary)
 * or separate mode (opens windows synchronously within single user gesture to avoid popup blocking).
 */
export function openMultipleWhatsappMessages(trips: Trip[], mode: 'combined' | 'separate' = 'combined', links: Record<string, string | null> = {}, tz?: string) {
  if (!trips || trips.length === 0) return;

  if (trips.length === 1 || mode === 'combined') {
    const text = trips.length === 1 ? formatSingleTripWhatsappMessage(trips[0], false, links[trips[0].id], tz) : formatMultipleTripsWhatsappMessage(trips, links, tz);

    // Pick customer phone if available
    const commonCustomer = trips[0].customer;
    const phone = commonCustomer?.contact_phone || '';
    const cleanPhone = phone.trim().replace(/\+/g, '').replace(/\D/g, '');

    const shareUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    // Copy formatted text to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    // Direct synchronous open (not inside setTimeout so browser doesn't block it)
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
    toast.success(
      trips.length === 1
        ? 'Opening WhatsApp message...'
        : `Opened WhatsApp with ${trips.length} trip updates! (Summary copied to clipboard)`
    );
  } else {
    // Separate mode: Open windows synchronously in loop without setTimeout
    let opened = 0;
    trips.forEach((trip) => {
      const text = formatSingleTripWhatsappMessage(trip, false, links[trip.id], tz);
      let phone = '';
      if (!trip.is_third_party && trip.driver?.phone_primary) {
        phone = trip.driver.phone_primary;
      } else if (trip.is_third_party && (trip.third_party_driver_phone || trip.thirdPartyProvider?.phone)) {
        phone = trip.third_party_driver_phone || trip.thirdPartyProvider?.phone || '';
      } else if (trip.customer?.contact_phone) {
        phone = trip.customer.contact_phone;
      }

      const cleanPhone = phone.trim().replace(/\+/g, '').replace(/\D/g, '');
      const shareUrl = cleanPhone
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      opened++;
    });

    if (navigator.clipboard) {
      const allText = formatMultipleTripsWhatsappMessage(trips, links, tz);
      navigator.clipboard.writeText(allText).catch(() => {});
    }

    toast.success(`Opening ${opened} separate WhatsApp windows. (Check browser pop-up permissions if blocked)`);
  }
}

/**
 * Formats a WhatsApp message specifically for photo evidence updates.
 */
export function formatPhotoEvidenceWhatsappMessage(params: {
  tripRef?: string;
  customerName?: string;
  stopName?: string;
  photoCount?: number;
  evidenceCategory?: string;
  uploadTime?: string;
  geotagCoords?: string;
  publicGalleryUrl?: string;
}): string {
  const tripRef = params.tripRef || 'TRIP';
  const customer = params.customerName ? `@${params.customerName}\n` : '';
  const stop = params.stopName ? `📍 *Stop*: ${params.stopName}\n` : '';
  const category = params.evidenceCategory ? `🏷️ *Category*: ${params.evidenceCategory}\n` : '';
  const count = params.photoCount ? `📷 *Photos Attached*: ${params.photoCount}\n` : '';
  const time = params.uploadTime ? `🕒 *Uploaded*: ${params.uploadTime}\n` : '';
  const gps = params.geotagCoords ? `🗺️ *GPS Location*: https://maps.google.com/?q=${encodeURIComponent(params.geotagCoords)}\n` : '';
  const gallery = params.publicGalleryUrl ? `\n🔗 *View Mobile Evidence Gallery*:\n${params.publicGalleryUrl}` : '';

  return `${customer}📸 *TRIP PHOTO EVIDENCE UPDATE* — [${tripRef}]\n\n` +
         `${stop}${category}${count}${time}${gps}` +
         `\n✅ Verified operational POD & geotag evidence.${gallery}`;
}

/**
 * Opens WhatsApp window to share photo evidence update for a trip/stop.
 */
export function openPhotoEvidenceWhatsapp(params: {
  tripRef?: string;
  customerName?: string;
  customerPhone?: string;
  stopName?: string;
  photoCount?: number;
  evidenceCategory?: string;
  uploadTime?: string;
  geotagCoords?: string;
  publicGalleryUrl?: string;
}) {
  const text = formatPhotoEvidenceWhatsappMessage(params);
  const cleanPhone = (params.customerPhone || '').trim().replace(/\+/g, '').replace(/\D/g, '');

  const shareUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
  toast.success('WhatsApp Photo Evidence update ready! Message copied to clipboard.');
}


