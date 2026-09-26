import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';

export const getPublicTripEvidence = async (req: Request, res: Response) => {
  try {
    const ref = (req.query.ref as string) || (req.query.token as string);
    if (!ref) {
      return res.status(400).json({ success: false, error: { message: 'Missing trip reference parameter (ref)' } });
    }

    const cleanRef = String(ref).trim();
    const rawNumber = cleanRef.replace(/^TRP-?/i, '').trim();
    const mode = 'insensitive' as Prisma.QueryMode;

    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanRef);

    // Query trip by ref_id (case-insensitive & variant tolerant) or ID
    const trip = await prisma.trip.findFirst({
      where: {
        OR: [
          ...(isUuid ? [{ id: cleanRef }] : []),
          { ref_id: { equals: cleanRef, mode } },
          { ref_id: { contains: cleanRef, mode } },
          ...(rawNumber ? [
            { ref_id: { equals: `TRP-${rawNumber}`, mode } },
            { ref_id: { equals: `TRP-${rawNumber.padStart(4, '0')}`, mode } },
            { ref_id: { endsWith: rawNumber, mode } }
          ] : [])
        ],
        deletedAt: null
      },
      include: {
        customer: { select: { name: true } },
        driver: { select: { first_name: true, last_name: true, phone_primary: true } },
        vehicle: { select: { plate_number: true, asset_type: true } },
        stops: {
          orderBy: { stop_sequence: 'asc' },
          include: { location: { select: { name: true, address: true } } }
        }
      }
    });

    if (!trip) {
      return res.status(404).json({ success: false, error: { message: 'Trip evidence gallery not found or link expired.' } });
    }

    const stopIds = trip.stops.map(s => s.id);

    // Query all real documents attached to this trip or any of its stops
    // NOTE: entity_id is a UUID column — never pass ref_id (e.g. "TRP-0252") here
    const documentRecords = await prisma.document.findMany({
      where: {
        OR: [
          { entity_type: 'Trip', entity_id: trip.id },
          { entity_type: 'TripStop', entity_id: { in: stopIds } }
        ],
        deletedAt: null
      },
      select: {
        id: true,
        doc_type: true,
        file_url: true,
        mime_type: true,
        ai_extracted_json: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const driverName = trip.is_third_party
      ? ((trip as any).third_party_driver_name || '3PL Driver')
      : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim() : 'Driver');

    const vehiclePlate = trip.is_third_party
      ? ((trip as any).third_party_vehicle_plate || '3PL Vehicle')
      : (trip.vehicle?.plate_number || 'Unassigned');

    const pickupStop = trip.stops.find(s => s.stop_type === 'Pickup') || trip.stops[0];
    const dropoffStop = trip.stops.find(s => s.stop_type === 'Dropoff') || trip.stops[trip.stops.length - 1];

    // Collect all documents, plus any direct pod_photo_url / delay_video_url directly on Trip or TripStops
    const allDocItems: Array<{
      id: string;
      doc_type?: string | null;
      file_url: string;
      mime_type?: string | null;
      ai_extracted_json?: any;
      createdAt: Date;
    }> = [...documentRecords];

    const existingUrls = new Set(documentRecords.map(d => d.file_url?.toLowerCase()));

    // Fallback direct trip files if not already in document list
    const directPodUrl = (trip as any).pod_photo_url || (trip as any).pod_url;
    if (directPodUrl && !existingUrls.has(String(directPodUrl).toLowerCase())) {
      allDocItems.push({
        id: `pod-${trip.id}`,
        doc_type: 'POD',
        file_url: directPodUrl,
        mime_type: 'image/jpeg',
        createdAt: trip.createdAt
      });
      existingUrls.add(String(directPodUrl).toLowerCase());
    }

    const directVideoUrl = (trip as any).delay_video_url || (trip as any).video_url;
    if (directVideoUrl && !existingUrls.has(String(directVideoUrl).toLowerCase())) {
      allDocItems.push({
        id: `delay-${trip.id}`,
        doc_type: 'Emergency',
        file_url: directVideoUrl,
        mime_type: 'video/mp4',
        createdAt: trip.createdAt
      });
      existingUrls.add(String(directVideoUrl).toLowerCase());
    }

    // Stop direct evidence URLs
    trip.stops.forEach((st: any) => {
      if (st.delay_video_url && !existingUrls.has(String(st.delay_video_url).toLowerCase())) {
        allDocItems.push({
          id: `stop-video-${st.id}`,
          doc_type: 'Emergency',
          file_url: st.delay_video_url,
          mime_type: 'video/mp4',
          createdAt: st.createdAt || trip.createdAt
        });
        existingUrls.add(String(st.delay_video_url).toLowerCase());
      }
      if (st.pod_photo_url && !existingUrls.has(String(st.pod_photo_url).toLowerCase())) {
        allDocItems.push({
          id: `stop-pod-${st.id}`,
          doc_type: 'POD',
          file_url: st.pod_photo_url,
          mime_type: 'image/jpeg',
          createdAt: st.createdAt || trip.createdAt
        });
        existingUrls.add(String(st.pod_photo_url).toLowerCase());
      }
    });

    const formattedDocs = allDocItems.map(doc => {
      const u = (doc.file_url || '').toLowerCase();
      const m = (doc.mime_type || '').toLowerCase();
      const isVideo = m.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|3gp)(\?.*)?$/i.test(u);

      let parsedJson: any = {};
      if (typeof doc.ai_extracted_json === 'string') {
        try {
          parsedJson = JSON.parse(doc.ai_extracted_json);
        } catch {
          parsedJson = { notes: doc.ai_extracted_json };
        }
      } else if (typeof doc.ai_extracted_json === 'object' && doc.ai_extracted_json !== null) {
        parsedJson = doc.ai_extracted_json;
      }

      const isDelay = doc.doc_type === 'Emergency' || doc.doc_type === 'DelayEvidence' || (parsedJson.operation || '').toLowerCase() === 'delay';

      let category = 'Trip Evidence';
      if (doc.doc_type === 'POD') category = 'POD Document';
      else if (doc.doc_type === 'Emergency' || doc.doc_type === 'DelayEvidence') category = 'Delay Evidence';
      else if (isDelay) category = 'Delay Evidence';
      else if (doc.doc_type === 'Waybill') category = 'Waybill Document';

      let rawNotes = parsedJson.notes || parsedJson.reason || parsedJson.notes_text || '';
      if (typeof rawNotes === 'string' && rawNotes.trim().startsWith('{')) {
        try {
          const inner = JSON.parse(rawNotes);
          rawNotes = inner.notes || inner.reason || inner.message || '';
        } catch {
          rawNotes = '';
        }
      }
      if (typeof rawNotes === 'string' && rawNotes.includes('[DELAY REPORT]')) {
        rawNotes = rawNotes.replace(/^\[DELAY REPORT\]:\s*/i, '').trim();
      }

      const displayTitle = (typeof rawNotes === 'string' && rawNotes.trim())
        ? rawNotes.trim()
        : `${category} • ${new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      return {
        id: doc.id,
        title: displayTitle,
        url: doc.file_url,
        mime_type: doc.mime_type,
        isVideo,
        isDelay,
        category,
        time: new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date(doc.createdAt).toLocaleDateString(),
        lat: parsedJson.lat || pickupStop?.location_lat,
        lng: parsedJson.lng || pickupStop?.location_lng,
        location: parsedJson.locationName || pickupStop?.location_name || pickupStop?.location?.name || 'En Route Location'
      };
    });

    res.json({
      success: true,
      data: {
        tripRef: trip.ref_id || 'TRIP',
        customerName: trip.customer?.name || 'Logistics Client',
        driverName,
        vehiclePlate,
        status: trip.status,
        pickupLocation: pickupStop?.location_name || pickupStop?.location?.name || 'Origin',
        dropoffLocation: dropoffStop?.location_name || dropoffStop?.location?.name || 'Destination',
        documents: formattedDocs
      }
    });
  } catch (error: any) {
    logger.error({ err: error }, 'getPublicTripEvidence error:');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
