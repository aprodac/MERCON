import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export interface MigrationReport {
  totalFound: number;
  migrated: number;
  skipped: number;
  failed: number;
  details: {
    driverId: string;
    driverName: string;
    status: 'MIGRATED' | 'SKIPPED' | 'FAILED';
    fileUrl?: string;
    reason?: string;
    sizeBytes?: number;
  }[];
}

/**
 * Validates image header magic bytes for PNG, JPEG, WebP, and GIF buffers.
 */
function isValidImageHeader(buffer: Buffer, ext: string): boolean {
  if (!buffer || buffer.length < 12) return false;

  switch (ext) {
    case 'png':
      // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    case 'jpg':
    case 'jpeg':
      // JPEG magic number: FF D8 FF
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'webp':
      // WebP magic number: 'RIFF' .... 'WEBP'
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'gif':
      // GIF magic number: 'GIF87a' or 'GIF89a'
      return buffer.subarray(0, 3).toString('ascii') === 'GIF';
    case 'heic':
    case 'heif':
      // HEIC/HEIF ftyp box check
      return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    default:
      return false;
  }
}

export async function runDriverAvatarMigration(): Promise<MigrationReport> {
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const report: MigrationReport = {
    totalFound: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  try {
    const drivers = await prisma.driver.findMany();
    report.totalFound = drivers.length;

    for (const driver of drivers) {
      const avatarUrl = (driver as any).avatar_url;
      const driverName = `${driver.first_name} ${driver.last_name}`;

      // 1. Skip if avatar_url is missing, empty, or already a normal URL/path
      if (!avatarUrl || typeof avatarUrl !== 'string' || !avatarUrl.startsWith('data:image')) {
        report.skipped++;
        report.details.push({
          driverId: driver.id,
          driverName,
          status: 'SKIPPED',
          reason: !avatarUrl ? 'No avatar_url present' : 'Already a file URL or non-base64 format',
        });
        continue;
      }

      // 2. Parse base64 string format: data:image/png;base64,iVBORw0...
      const matches = avatarUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        report.failed++;
        report.details.push({
          driverId: driver.id,
          driverName,
          status: 'FAILED',
          reason: 'Invalid base64 data URI structure',
        });
        continue;
      }

      const mimeType = matches[1].toLowerCase();
      const base64Data = matches[2];

      const ext = ALLOWED_MIME_TYPES[mimeType];
      if (!ext) {
        report.failed++;
        report.details.push({
          driverId: driver.id,
          driverName,
          status: 'FAILED',
          reason: `Unsupported image MIME type: ${mimeType}`,
        });
        continue;
      }

      // 3. Deterministic filename pattern: driver-avatar-{driver.id}.<extension>
      const filename = `driver-avatar-${driver.id}.${ext}`;
      const tempFilePath = path.join(uploadDir, `${filename}.tmp`);
      const targetFilePath = path.join(uploadDir, filename);
      const relativeUrl = `/uploads/${filename}`;

      try {
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Magic byte image header validation
        if (!isValidImageHeader(imageBuffer, ext)) {
          throw new Error(`Magic byte validation failed: Decoded buffer does not contain valid ${ext.toUpperCase()} image header`);
        }

        // Write to temporary file first (safe temporary file write)
        fs.writeFileSync(tempFilePath, imageBuffer);

        // Verify temporary file exists on disk and size matches
        if (!fs.existsSync(tempFilePath)) {
          throw new Error('Temporary file creation failed on disk');
        }

        const tempStat = fs.statSync(tempFilePath);
        if (tempStat.size !== imageBuffer.length || tempStat.size === 0) {
          fs.unlinkSync(tempFilePath);
          throw new Error(`Size mismatch on temp file: expected ${imageBuffer.length} bytes, found ${tempStat.size} bytes`);
        }

        // Atomic rename from temp file to final target file path
        fs.renameSync(tempFilePath, targetFilePath);

        // Final verification of target file on disk
        const targetStat = fs.statSync(targetFilePath);
        if (targetStat.size !== imageBuffer.length) {
          throw new Error('Final target file verification failed after atomic rename');
        }

        // ONLY AFTER SUCCESSFUL FILE VERIFICATION, update database record
        await prisma.driver.update({
          where: { id: driver.id },
          data: { avatar_url: relativeUrl } as any,
        });

        report.migrated++;
        report.details.push({
          driverId: driver.id,
          driverName,
          status: 'MIGRATED',
          fileUrl: relativeUrl,
          sizeBytes: targetStat.size,
        });
      } catch (err: any) {
        // Clean up temporary file if left over
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch (_) {}
        }

        report.failed++;
        report.details.push({
          driverId: driver.id,
          driverName,
          status: 'FAILED',
          reason: err.message || 'Write/verification error',
        });
        // Original Base64 remains untouched in database when write/verification fails!
      }
    }
  } catch (err: any) {
    console.error('Fatal error during driver avatar migration:', err);
  }

  return report;
}

// CLI execution wrapper
if (require.main === module) {
  console.log('🚀 Starting Driver Avatar Base64 Migration...');
  runDriverAvatarMigration()
    .then((report) => {
      console.log('\n============== MIGRATION REPORT ==============');
      console.log(`Total Drivers Processed : ${report.totalFound}`);
      console.log(`Successfully Migrated   : ${report.migrated}`);
      console.log(`Skipped (Already URLs)  : ${report.skipped}`);
      console.log(`Failed (Left Untouched) : ${report.failed}`);
      console.log('==============================================\n');
      console.log(JSON.stringify(report.details, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed with unhandled exception:', err);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
