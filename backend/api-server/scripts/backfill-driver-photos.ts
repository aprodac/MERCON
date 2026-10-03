/**
 * Saves the 22 driver profile photos in scripts/driver-photos/ onto the
 * matching Driver rows (Driver.avatar_url = /uploads/...).
 *
 * Why: these photos used to live only in the web dashboard, which guessed the
 * photo from the driver's name (lib/driverAvatarMap.ts). The database had no
 * photo, so the public tracking pages, both mobile apps and most web screens
 * showed initials. With the photo on the row, every screen gets it.
 *
 * A photo is applied only when exactly one driver's full name (first + last,
 * case/space-insensitive) equals the name below — or, failing that, exactly
 * one driver is saved under its first two or more words ("SAFI ULLAH").
 * Anything else is reported and skipped; assign those by hand with
 * --assign <file>=<driver ref_id or id>. Check the dry run before --apply.
 * Drivers who already have a real photo are never touched.
 *
 * Run inside the API container, so the files land in its uploads volume:
 *   docker compose -p mercon exec -T mercon-api npx ts-node scripts/backfill-driver-photos.ts           # dry run
 *   docker compose -p mercon exec -T mercon-api npx ts-node scripts/backfill-driver-photos.ts --apply   # save
 *
 * Safe to run more than once: a second run finds every matched driver
 * already has a photo and skips it.
 *
 * Deploys (ci-cd.yml, ci-cd-dev.yml) run it with `--apply --once`: it runs
 * the first time on each server and leaves a marker file in the uploads
 * folder, so later deploys never re-add a photo someone removed or give one
 * to a newly added driver who happens to share a short name.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { storeInlineImage } from '../src/services/inlineImage';
import { getUploadDir } from '../src/middlewares/upload';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const ONCE = process.argv.includes('--once');
const PHOTO_DIR = path.join(__dirname, 'driver-photos');
/** Written next to the uploads after an --apply --once run, so later deploys skip it. */
const DONE_MARKER = path.join(getUploadDir(), '.driver-photos-backfilled');

/** Photo file → the driver's full name as written on the photo. */
const PHOTOS: Record<string, string> = {
  'kashif_ali_muhammed_aslam.png': 'KASHIF ALI MUHAMMED ASLAM',
  'liaqat_ali_muhammed_sultan.png': 'LIAQAT ALI MUHAMMED SULTAN',
  'mohammed_faizan_faiz_ahmed.png': 'MOHAMMED FAIZAN FAIZ AHMED',
  'mohammed_iqbal_hossain.png': 'MOHAMMED IQBAL HOSSAIN',
  'muhammad_yasin_khair_din.png': 'MUHAMMAD YASIN KHAIR DIN',
  'muhammed_abrar_abdul_kareem.png': 'MUHAMMED ABRAR ABDUL KAREEM',
  'muhammed_rizwan_maqsood_ahmad.png': 'MUHAMMED RIZWAN MAQSOOD AHMAD',
  'muhammed_shahbaz_muhammad_taz.png': 'MUHAMMED SHAHBAZ MUHAMMAD TAZ',
  'muhammed_shahzad_muhammed_ayub_baig.png': 'MUHAMMED SHAHZAD MUHAMMED AYUB BAIG',
  'muhammed_umair_muhammed_ali.png': 'MUHAMMED UMAIR MUHAMMED ALI',
  'nadar_khan_gul_shahzada.png': 'NADAR KHAN GUL SHAHZADA',
  'naseebullah_taj_mani_khan.png': 'NASEEBULLAH TAJ MANI KHAN',
  'nouman_ashraf_muhammed_ashraf.png': 'NOUMAN ASHRAF MUHAMMED ASHRAF',
  'rabiaz_khan_shah_qiaz_khan.png': 'RABIAZ KHAN SHAH QIAZ KHAN',
  'safi_ullah_akhtar_ali.png': 'SAFI ULLAH AKHTAR ALI',
  'saleem_taha_khan.png': 'SALEEM TAHA KHAN',
  'sawab_khan_taj_mani_khan.png': 'SAWAB KHAN TAJ MANI KHAN',
  'umar_farooq_muhammed_bashir.png': 'UMAR FAROOQ MUHAMMED BASHIR',
  'usman_habib_habib_khan.png': 'USMAN HABIB HABIB KHAN',
  'waseem_akram_rab_nawaz.png': 'WASEEM AKRAM RAB NAWAZ',
  'wisal_zar_said.png': 'WISAL ZAR SAID',
  'abdul_malik.jpg': 'ABDUL MALIK MALIK',
};

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg' };

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

type Driver = { id: string; ref_id: string | null; first_name: string; last_name: string; avatar_url: string | null };

/**
 * Drivers are often saved under the first words of the name on the photo
 * ("SAFI ULLAH" for "SAFI ULLAH AKHTAR ALI"). Accept that when at least two
 * whole words line up; the caller still requires exactly one such driver.
 */
const isShortForm = (driverName: string, photoName: string) =>
  driverName.split(' ').length >= 2 && photoName.startsWith(`${driverName} `);

const label = (d: Driver) => `${d.ref_id ?? d.id} "${d.first_name} ${d.last_name}"`;

/**
 * A photo is "missing" when the column is empty or still holds one of the old
 * web-only /driver-assets/ paths (which no other app can load).
 */
const hasRealPhoto = (d: Driver) => !!d.avatar_url?.trim() && !d.avatar_url.startsWith('/driver-assets/');

/** --assign file=driver pairs, for names that don't match exactly. */
function manualAssignments(): Map<string, string> {
  const out = new Map<string, string>();
  process.argv.forEach((arg, i) => {
    if (arg !== '--assign') return;
    const [file, driver] = (process.argv[i + 1] ?? '').split('=');
    if (!PHOTOS[file] || !driver) throw new Error(`Bad --assign "${process.argv[i + 1]}" (expected <photo file>=<driver ref_id or id>)`);
    out.set(file, driver);
  });
  return out;
}

async function main() {
  if (ONCE && fs.existsSync(DONE_MARKER)) {
    console.log(`Driver photos were already backfilled on this server (${DONE_MARKER}) — nothing to do.`);
    return;
  }
  console.log(APPLY ? 'Saving driver photos…' : 'Dry run (pass --apply to save)…');
  const assign = manualAssignments();

  const drivers: Driver[] = await prisma.driver.findMany({
    where: { deletedAt: null },
    select: { id: true, ref_id: true, first_name: true, last_name: true, avatar_url: true },
  });

  const counts = { saved: 0, hasPhoto: 0, unmatched: 0, ambiguous: 0 };

  for (const [file, name] of Object.entries(PHOTOS)) {
    let matches: Driver[];
    let how = 'exact name';
    const manual = assign.get(file);
    if (manual) {
      matches = drivers.filter((d) => d.ref_id === manual || d.id === manual);
      how = '--assign';
    } else {
      matches = drivers.filter((d) => norm(`${d.first_name} ${d.last_name}`) === norm(name));
      if (matches.length === 0) {
        matches = drivers.filter((d) => isShortForm(norm(`${d.first_name} ${d.last_name}`), norm(name)));
        how = 'short name';
      }
    }

    if (matches.length === 0) {
      counts.unmatched++;
      const words = norm(name).split(' ').slice(0, 2).join(' ');
      const near = drivers.filter((d) => norm(`${d.first_name} ${d.last_name}`).includes(words));
      console.log(`  ✗ ${file}: no driver named "${manual ?? name}"${near.length ? ` — similar: ${near.map(label).join(', ')}` : ''}`);
      continue;
    }
    if (matches.length > 1) {
      counts.ambiguous++;
      console.log(`  ✗ ${file}: ${matches.length} drivers match — ${matches.map(label).join(', ')}; use --assign ${file}=<ref_id>`);
      continue;
    }

    const driver = matches[0];
    if (hasRealPhoto(driver)) {
      counts.hasPhoto++;
      console.log(`  · ${file}: ${label(driver)} already has a photo (${driver.avatar_url}) — skipped`);
      continue;
    }

    if (!APPLY) {
      counts.saved++;
      console.log(`  [dry run] ${file} → ${label(driver)} (${how})`);
      continue;
    }

    const bytes = fs.readFileSync(path.join(PHOTO_DIR, file));
    const dataUrl = `data:${MIME[path.extname(file)]};base64,${bytes.toString('base64')}`;
    const url = (await storeInlineImage(dataUrl)) as string;
    await prisma.driver.update({ where: { id: driver.id }, data: { avatar_url: url } });
    counts.saved++;
    console.log(`  ✓ ${file} → ${label(driver)} (${how}) = ${url}`);
  }

  console.log(
    `\n${APPLY ? 'Saved' : 'Would save'}: ${counts.saved}, already had a photo: ${counts.hasPhoto}, ` +
      `no match: ${counts.unmatched}, more than one match: ${counts.ambiguous}`,
  );

  if (APPLY && ONCE) {
    fs.writeFileSync(DONE_MARKER, `${new Date().toISOString()} saved=${counts.saved}\n`);
    console.log(`Marked done (${DONE_MARKER}); later --once runs skip. Run without --once to assign more by hand.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
