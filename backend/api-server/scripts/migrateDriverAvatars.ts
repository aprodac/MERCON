import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { compressUploadedImage } from '../src/services/imageCompressor';

const prisma = new PrismaClient();
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.resolve('/tmp', 'uploads');

async function run() {
  const isDryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(UPLOADS_DIR) && !isDryRun) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o777 });
  }

  console.log(`Starting Driver Avatar Migration (Dry Run: ${isDryRun})`);
  
  const drivers = await prisma.driver.findMany({
    where: {
      avatar_url: {
        startsWith: 'data:image/'
      }
    },
    select: { id: true, ref_id: true, first_name: true, avatar_url: true }
  });

  console.log(`Found ${drivers.length} drivers needing avatar migration.`);

  let successCount = 0;
  let failCount = 0;

  for (const driver of drivers) {
    try {
      if (!driver.avatar_url) continue;

      const matches = driver.avatar_url.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        console.warn(`[WARN] Driver ${driver.id}: Invalid Base64 format, skipping.`);
        failCount++;
        continue;
      }

      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const approxSizeKb = Math.round(buffer.length / 1024);

      console.log(`Driver ${driver.ref_id || driver.id} (${driver.first_name}): Found Base64 image (${ext}, ~${approxSizeKb} KB)`);

      if (isDryRun) {
        successCount++;
        continue;
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = `files-${uniqueSuffix}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      // Write file
      fs.writeFileSync(filepath, buffer);

      // Compress
      try {
        await compressUploadedImage(filepath);
      } catch (err) {
        console.warn(`[WARN] Driver ${driver.id}: Compression failed, using original file.`, err);
      }

      if (!fs.existsSync(filepath)) {
        throw new Error('File was not written successfully');
      }

      const newUrl = `/uploads/${filename}`;

      await prisma.driver.update({
        where: { id: driver.id },
        data: { avatar_url: newUrl }
      });

      console.log(`[SUCCESS] Migrated Driver ${driver.id} to ${newUrl}`);
      successCount++;
    } catch (err) {
      console.error(`[ERROR] Failed to migrate Driver ${driver.id}:`, err);
      failCount++;
    }
  }

  console.log('\nMigration Summary:');
  console.log(`Total Found: ${drivers.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
