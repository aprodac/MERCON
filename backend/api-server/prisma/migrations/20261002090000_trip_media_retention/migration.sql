-- Trip media retention: trip photos and videos are deleted from disk 60 days
-- after the trip ends (services/media/tripMediaRetention.ts). Additive: one
-- nullable column recording when the file was removed.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "file_purged_at" TIMESTAMPTZ;
