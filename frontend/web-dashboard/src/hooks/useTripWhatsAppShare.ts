import { useEffect, useState } from 'react';
import { Trip } from '@/services/tripService';
import { openMultipleWhatsappMessages } from '@/utils/whatsappFormatter';
import { useTrackingLinks } from '@/hooks/useTrackingLink';
import { useDeploymentTimezone } from '@/lib/datetime';
import { tripStatusMessage, tripsStatusMessage } from '@/utils/statusMessage';

export type WhatsAppRecipientType = 'driver' | 'customer' | 'custom';

/**
 * The WhatsApp share dialog on the trips list: pick a recipient, preview a
 * composed message (single-trip manifest line or a multi-trip summary), and
 * either open WhatsApp's web/app share URL for one trip or fire off one
 * window per trip for a bulk share. Extracted out of TripListPage as-is —
 * same state, same message-composition rule, same window.open call.
 */
export function useTripWhatsAppShare() {
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappSelectedTrips, setWhatsappSelectedTrips] = useState<Trip[]>([]);
  const [whatsappRecipientType, setWhatsappRecipientType] = useState<WhatsAppRecipientType>('custom');
  const [whatsappCustomPhone, setWhatsappCustomPhone] = useState('');
  const [whatsappMessageText, setWhatsappMessageText] = useState('');
  // Customer tracking links for the chosen trips (only customers who want them in messages).
  const trackingLinks = useTrackingLinks(whatsappSelectedTrips.map((t) => t.id), whatsappDialogOpen);
  const [whatsappWithTailgate, setWhatsappWithTailgate] = useState(false);
  const tz = useDeploymentTimezone();

  const openWhatsappShare = (selectedRows: Trip[]) => {
    setWhatsappSelectedTrips(selectedRows);
    if (selectedRows.length === 0) return;
    setWhatsappWithTailgate(false);

    if (selectedRows.length === 1) {
      const trip = selectedRows[0];
      if (!trip.is_third_party && trip.driver?.phone_primary) {
        setWhatsappRecipientType('driver');
      } else if (trip.is_third_party && (trip.third_party_driver_phone || trip.thirdPartyProvider?.phone)) {
        setWhatsappRecipientType('custom');
        setWhatsappCustomPhone(trip.third_party_driver_phone || trip.thirdPartyProvider?.phone || '');
      } else if (trip.customer?.contact_phone) {
        setWhatsappRecipientType('customer');
      } else {
        setWhatsappRecipientType('custom');
        setWhatsappCustomPhone('');
      }
    } else {
      setWhatsappRecipientType('custom');
      setWhatsappCustomPhone('');
    }

    setWhatsappDialogOpen(true);
  };

  useEffect(() => {
    if (!whatsappDialogOpen || whatsappSelectedTrips.length === 0) return;

    // One format everywhere (utils/statusMessage → @mercon/shared-types), same as the operator app.
    if (whatsappSelectedTrips.length === 1) {
      const trip = whatsappSelectedTrips[0];
      setWhatsappMessageText(tripStatusMessage(trip, tz, trackingLinks[trip.id], whatsappWithTailgate ? ['WITH TAILGATE'] : undefined));
    } else {
      setWhatsappMessageText(tripsStatusMessage(whatsappSelectedTrips, tz, trackingLinks));
    }
  }, [whatsappSelectedTrips, whatsappWithTailgate, whatsappDialogOpen, trackingLinks, tz]);

  const handleWhatsappSend = () => {
    if (whatsappSelectedTrips.length > 1) {
      openMultipleWhatsappMessages(whatsappSelectedTrips, 'combined', trackingLinks, tz);
      setWhatsappDialogOpen(false);
      return;
    }

    let phone = '';
    if (whatsappSelectedTrips.length === 1) {
      const trip = whatsappSelectedTrips[0];
      if (whatsappRecipientType === 'driver') {
        phone = trip.driver?.phone_primary || '';
      } else if (whatsappRecipientType === 'customer') {
        phone = trip.customer?.contact_phone || '';
      } else {
        phone = whatsappCustomPhone;
      }
    } else {
      phone = whatsappCustomPhone;
    }

    const cleanPhone = phone.trim().replace(/\+/g, '').replace(/\D/g, '');
    const shareUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessageText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessageText)}`;
    window.open(shareUrl, '_blank');
    setWhatsappDialogOpen(false);
  };

  return {
    whatsappDialogOpen,
    setWhatsappDialogOpen,
    whatsappSelectedTrips,
    whatsappRecipientType,
    setWhatsappRecipientType,
    whatsappCustomPhone,
    setWhatsappCustomPhone,
    whatsappMessageText,
    setWhatsappMessageText,
    whatsappWithTailgate,
    setWhatsappWithTailgate,
    openWhatsappShare,
    handleWhatsappSend,
  };
}
