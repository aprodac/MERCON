-- Trip paperwork (delivery proof, waybill, customs, incident) has no expiry date
-- and usually comes as several photos. The seed created every document type as
-- "expiry required, one file", so uploading 3 delivery photos to a trip was
-- refused and asked for an expiry date. One-time fix; later Admin edits in
-- Settings → Document types are untouched.
UPDATE "DocumentType"
SET "requiresExpiryDate" = false,
    "allowsMultipleFiles" = true,
    "updatedAt" = NOW()
WHERE "ownerType" = 'Trip'
  AND "code" IN ('POD', 'Waybill', 'CustomsClearance', 'Emergency');
