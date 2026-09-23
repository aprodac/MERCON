import { Trip } from '@/services/tripService';
import { calculateRoadDistanceKm, resolveCityCoords } from '@/services/travelTimeService';
import { toast } from 'sonner';

/**
 * Formats a single trip message for WhatsApp dispatch.
 */
export function formatSingleTripWhatsappMessage(trip: Trip, withTailgate = false): string {
  const customerName = trip.customer?.name || 'Unassigned';
  const driverName = trip.is_third_party
    ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3PL Driver')
    : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim() : 'Unassigned');
  const plate = trip.is_third_party
    ? (trip.third_party_vehicle_plate || '3PL Vehicle')
    : (trip.vehicle?.plate_number || 'Unassigned');

  const pickupName = trip.stops?.find((s) => s.stop_type === 'Pickup')?.location_name || trip.stops?.[0]?.location_name || 'Origin';
  const dropoffStop = trip.stops?.find((s) => s.stop_type === 'Dropoff') || trip.stops?.[trip.stops.length - 1];
  const dropoffName = dropoffStop?.location_name || 'Destination';

  const isScheduled = ['Draft', 'Scheduled'].includes(trip.status);

  if (isScheduled) {
    const isMonthly = trip.billing_type?.toUpperCase().includes('MONTHLY') || trip.quotation_billing_type?.toUpperCase().includes('MONTHLY');
    const billingLabel = isMonthly ? 'MONTHLY' : 'EXTRA';
    const vClass = trip.quotation_vehicle_class || trip.vehicle_type || trip.vehicle?.asset_type || 'VEHICLE';
    const lType = trip.quotation_line_type || 'ROUND TRIP';

    let text = `@${customerName}\n` +
           `*(${billingLabel} VEHICLE)*\n` +
           `1. ${pickupName}>>>${dropoffName} ${vClass} (${lType})\n` +
           `Driver name # ${driverName}\n` +
           `Number # ${trip.driver?.phone_primary || trip.third_party_driver_phone || 'Unassigned'}\n` +
           `Truck no # ${plate}`;

    if (withTailgate) {
      text += `\n\nWITH TAILGATE`;
    }
    return text;
  } else {
    let distanceText = 'Unavailable';
    let etaText = 'Unavailable';

    const vehicleLat = trip.vehicle?.resolved_location?.latitude;
    const vehicleLng = trip.vehicle?.resolved_location?.longitude;

    let destLat = dropoffStop?.location_lat;
    let destLng = dropoffStop?.location_lng;

    if (!destLat || !destLng) {
      const resolvedDest = resolveCityCoords(dropoffName);
      if (resolvedDest) {
        destLat = resolvedDest.lat;
        destLng = resolvedDest.lng;
      }
    }

    if (vehicleLat && vehicleLng && destLat && destLng) {
      const distKm = calculateRoadDistanceKm(vehicleLat, vehicleLng, destLat, destLng);
      distanceText = `${distKm}KM TO ${dropoffName.toUpperCase()}`;
      const etaHours = (distKm / 70).toFixed(1);
      etaText = `${etaHours}HRS`;
    }

    let statusDisplay = trip.status;
    if (trip.status === 'AtPickup') statusDisplay = 'Loading';
    else if (trip.status === 'AtDelivery') statusDisplay = 'At Delivery';
    else if (trip.status === 'InTransit') statusDisplay = 'In Transit';

    return `🚛 Vehicle Status Update\n\n` +
           `Truck: *${plate}*\n` +
           `Driver: ${driverName}\n` +
           `Route: ${pickupName}>>>${dropoffName}\n` +
           `Distance left: ${distanceText}\n` +
           `ETA: ${etaText}\n` +
           `Status: ${statusDisplay}`;
  }
}

export function formatMultipleTripsWhatsappMessage(trips: Trip[]): string {
  if (!trips || trips.length === 0) return '';
  if (trips.length === 1) return formatSingleTripWhatsappMessage(trips[0]);

  const firstTrip = trips[0];
  const customerName = firstTrip.customer?.name || 'LOGISTICS DISPATCH';
  const isScheduled = ['Draft', 'Scheduled'].includes(firstTrip.status);

  if (isScheduled) {
    const isMonthly = firstTrip.billing_type?.toUpperCase().includes('MONTHLY') || firstTrip.quotation_billing_type?.toUpperCase().includes('MONTHLY');
    const billingLabel = isMonthly ? 'MONTHLY' : 'EXTRA';

    let text = `@${customerName}\n` +
               `*(${billingLabel} VEHICLE DISPATCH — ${trips.length} TRIPS)*\n\n`;

    const items = trips.map((trip, idx) => {
      const driverName = trip.is_third_party
        ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3PL Driver')
        : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim() : 'Unassigned');
      const plate = trip.is_third_party
        ? (trip.third_party_vehicle_plate || '3PL Vehicle')
        : (trip.vehicle?.plate_number || 'Unassigned');

      const pickupName = trip.stops?.find((s) => s.stop_type === 'Pickup')?.location_name || trip.stops?.[0]?.location_name || 'Origin';
      const dropoffStop = trip.stops?.find((s) => s.stop_type === 'Dropoff') || trip.stops?.[trip.stops.length - 1];
      const dropoffName = dropoffStop?.location_name || 'Destination';
      const vClass = trip.quotation_vehicle_class || trip.vehicle_type || trip.vehicle?.asset_type || 'VEHICLE';
      const lType = trip.quotation_line_type || 'ROUND TRIP';
      const driverPhone = trip.driver?.phone_primary || trip.third_party_driver_phone || 'Unassigned';

      return `${idx + 1}. *${trip.ref_id || 'TRIP'}* | ${pickupName}>>>${dropoffName} ${vClass} (${lType})\n` +
             `   • Driver: ${driverName} (${driverPhone})\n` +
             `   • Truck: ${plate}`;
    });

    return text + items.join('\n\n');
  } else {
    let text = `🚨 *VEHICLE STATUS REPORT (${trips.length} TRIPS)*\n\n`;

    const items = trips.map((trip, idx) => {
      const driverName = trip.is_third_party
        ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3PL Driver')
        : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim() : 'Unassigned');
      const plate = trip.is_third_party
        ? (trip.third_party_vehicle_plate || '3PL Vehicle')
        : (trip.vehicle?.plate_number || 'Unassigned');

      const pickupName = trip.stops?.find((s) => s.stop_type === 'Pickup')?.location_name || trip.stops?.[0]?.location_name || 'Origin';
      const dropoffStop = trip.stops?.find((s) => s.stop_type === 'Dropoff') || trip.stops?.[trip.stops.length - 1];
      const dropoffName = dropoffStop?.location_name || 'Destination';

      let distanceText = 'Unavailable';
      let etaText = 'Unavailable';

      const vehicleLat = trip.vehicle?.resolved_location?.latitude;
      const vehicleLng = trip.vehicle?.resolved_location?.longitude;

      let destLat = dropoffStop?.location_lat;
      let destLng = dropoffStop?.location_lng;

      if (!destLat || !destLng) {
        const resolvedDest = resolveCityCoords(dropoffName);
        if (resolvedDest) {
          destLat = resolvedDest.lat;
          destLng = resolvedDest.lng;
        }
      }

      if (vehicleLat && vehicleLng && destLat && destLng) {
        const distKm = calculateRoadDistanceKm(vehicleLat, vehicleLng, destLat, destLng);
        distanceText = `${distKm}KM TO ${dropoffName.toUpperCase()}`;
        const etaHours = (distKm / 70).toFixed(1);
        etaText = `${etaHours}HRS`;
      }

      let statusDisplay = trip.status;
      if (trip.status === 'AtPickup') statusDisplay = 'Loading';
      else if (trip.status === 'AtDelivery') statusDisplay = 'At Delivery';
      else if (trip.status === 'InTransit') statusDisplay = 'In Transit';

      return `${idx + 1}. *${trip.ref_id || 'TRIP'}* | Truck: *${plate}*\n` +
             `   • Driver: ${driverName}\n` +
             `   • Route: ${pickupName}>>>${dropoffName}\n` +
             `   • Status: *${statusDisplay}*\n` +
             `   • ETA: ${etaText} | Dist: ${distanceText}`;
    });

    return text + items.join('\n\n');
  }
}

/**
 * Triggers WhatsApp messages for an array of selected trips.
 * Supports combined mode (recommended: 1 window with formatted summary)
 * or separate mode (opens windows synchronously within single user gesture to avoid popup blocking).
 */
export function openMultipleWhatsappMessages(trips: Trip[], mode: 'combined' | 'separate' = 'combined') {
  if (!trips || trips.length === 0) return;

  if (trips.length === 1 || mode === 'combined') {
    const text = trips.length === 1 ? formatSingleTripWhatsappMessage(trips[0]) : formatMultipleTripsWhatsappMessage(trips);

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
      const text = formatSingleTripWhatsappMessage(trip);
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
      const allText = formatMultipleTripsWhatsappMessage(trips);
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


