/**
 * Moves base64 `data:` images out of the database into the uploads folder and
 * stores their `/uploads/...` link instead, for Driver.avatar_url,
 * Vehicle.image_url and Customer.logo_url.
 *
 * Why: those columns are sent with every list that includes a driver, vehicle
 * or customer. On production 10 driver photos (up to 2.8 MB each) made the
 * operator app's live map ~10 MB per 30 s refresh and the trip history
 * ~8 MB per page. New uploads are converted on save (middlewares/inlineImages.ts);
 * this script converts the rows saved before that.
 *
 * Run inside the API container, so the files land in its uploads volume:
 *   docker compose -p mercon exec -T mercon-api npx ts-node scripts/convert-inline-images.ts           # dry run
 *   docker compose -p mercon exec -T mercon-api npx ts-node scripts/convert-inline-images.ts --apply   # convert
 *
 * Safe to run more than once: only values still starting with `data:image/`
 * are touched. Soft-deleted rows are converted too.
 */
import { PrismaClient } from '@prisma/client';
import { storeInlineImage } from '../src/services/inlineImage';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const PREFIX = 'data:image/';

type Row = { id: string; label: string; value: string };

async function convert(table: string, rows: Row[], save: (id: string, url: string) => Promise<unknown>) {
  let bytes = 0;
  for (const row of rows) {
    bytes += row.value.length;
    if (!APPLY) {
      console.log(`  [dry run] ${table} ${row.label}: ${(row.value.length / 1048576).toFixed(2)} MB`);
      continue;
    }
    const url = await storeInlineImage(row.value);
    await save(row.id, url as string);
    console.log(`  ${table} ${row.label}: ${(row.value.length / 1048576).toFixed(2)} MB -> ${url}`);
  }
  console.log(`${table}: ${rows.length} inline image(s), ${(bytes / 1048576).toFixed(1)} MB`);
}

async function main() {
  console.log(APPLY ? 'Converting inline images…' : 'Dry run (pass --apply to convert)…');

  const drivers = await prisma.driver.findMany({
    where: { avatar_url: { startsWith: PREFIX } },
    select: { id: true, first_name: true, last_name: true, avatar_url: true },
  });
  await convert(
    'Driver.avatar_url',
    drivers.map((d) => ({ id: d.id, label: `${d.first_name} ${d.last_name}`, value: d.avatar_url! })),
    (id, url) => prisma.driver.update({ where: { id }, data: { avatar_url: url } }),
  );

  const vehicles = await prisma.vehicle.findMany({
    where: { image_url: { startsWith: PREFIX } },
    select: { id: true, plate_number: true, image_url: true },
  });
  await convert(
    'Vehicle.image_url',
    vehicles.map((v) => ({ id: v.id, label: v.plate_number, value: v.image_url! })),
    (id, url) => prisma.vehicle.update({ where: { id }, data: { image_url: url } }),
  );

  const customers = await prisma.customer.findMany({
    where: { logo_url: { startsWith: PREFIX } },
    select: { id: true, name: true, logo_url: true },
  });
  await convert(
    'Customer.logo_url',
    customers.map((c) => ({ id: c.id, label: c.name, value: c.logo_url! })),
    (id, url) => prisma.customer.update({ where: { id }, data: { logo_url: url } }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
