import { Request, Response } from 'express';
import { prisma } from '../db';

/** The logged-in driver's compliance documents (License, Iqama, Medical, Insurance), newest first. */
export const getDriverDocuments = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  try {
    const documents = await prisma.document.findMany({
      where: {
        entity_type: 'Driver',
        entity_id: driverId,
        deletedAt: null,
        doc_type: { notIn: ['POD', 'Waybill'] },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        doc_type: true,
        documentType: { select: { name: true } },
        status: true,
        file_url: true,
        mime_type: true,
        issue_date: true,
        expiry_date: true,
        entity_type: true,
        entity_id: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** All Cargo Pickup (Waybill) and POD Delivery photos uploaded for the driver's trips. */
export const getDriverTripPhotos = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  try {
    const driverTrips = await prisma.trip.findMany({
      where: { driverId, deletedAt: null },
      select: { id: true, ref_id: true, customer: { select: { name: true } } },
    });
    const tripIds = driverTrips.map((t) => t.id);
    const tripMap = new Map(driverTrips.map((t) => [t.id, { ref_id: t.ref_id, customer_name: t.customer?.name ?? '—' }]));

    const documents = await prisma.document.findMany({
      where: {
        entity_type: 'Trip',
        entity_id: { in: tripIds },
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        doc_type: true,
        status: true,
        file_url: true,
        mime_type: true,
        issue_date: true,
        expiry_date: true,
        entity_type: true,
        entity_id: true,
        createdAt: true,
        ai_extracted_json: true,
        ocr_raw_text: true,
      },
    });

    const formatted = documents.map((d) => {
      const trip = tripMap.get(d.entity_id);
      return {
        ...d,
        trip_ref_id: trip?.ref_id || null,
        customer_name: trip?.customer_name || '—',
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
