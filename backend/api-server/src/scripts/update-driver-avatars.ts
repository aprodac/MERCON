import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const DRIVER_PROFILES = [
  'KASHIF ALI MUHAMMED ASLAM',
  'LIAQAT ALI MUHAMMED SULTAN',
  'MOHAMMED FAIZAN FAIZ AHMED',
  'MOHAMMED IQBAL HOSSAIN',
  'MUHAMMAD YASIN KHAIR DIN',
  'MUHAMMED ABRAR ABDUL KAREEM',
  'MUHAMMED RIZWAN MAQSOOD AHMAD',
  'MUHAMMED SHAHBAZ MUHAMMAD TAZ',
  'MUHAMMED SHAHZAD MUHAMMED AYUB BAIG',
  'MUHAMMED UMAIR MUHAMMED ALI',
  'NADAR KHAN GUL SHAHZADA',
  'NASEEBULLAH TAJ MANI KHAN',
  'NOUMAN ASHRAF MUHAMMED ASHRAF',
  'RABIAZ KHAN SHAH QIAZ KHAN',
  'SAFI ULLAH AKHTAR ALI',
  'SALEEM TAHA KHAN',
  'SAWAB KHAN TAJ MANI KHAN',
  'UMAR FAROOQ MUHAMMED BASHIR',
  'USMAN HABIB HABIB KHAN',
  'WASEEM AKRAM RAB NAWAZ',
  'WISAL ZAR SAID',
];

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, ' ').trim();
}

function getSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_') + '.png';
}

async function main() {
  const rootDir = path.resolve(process.cwd(), '../..');
  const srcDir = fs.existsSync(path.join(rootDir, 'driver profile'))
    ? path.join(rootDir, 'driver profile')
    : fs.existsSync(path.join(rootDir, 'driverprofile'))
    ? path.join(rootDir, 'driverprofile')
    : path.resolve(process.cwd(), 'driver profile');

  const destDriverProfile = path.join(rootDir, 'driverprofile');
  const destFront = path.join(rootDir, 'frontend/web-dashboard/public/driver-assets');
  const destUploads = path.join(rootDir, 'backend/api-server/uploads');

  fs.mkdirSync(destDriverProfile, { recursive: true });
  fs.mkdirSync(destFront, { recursive: true });
  fs.mkdirSync(destUploads, { recursive: true });

  console.log(`📦 Copying compressed driver profile images from "${srcDir}"...`);
  const profileMap = new Map<string, string>(); // normalized name -> avatar url

  for (const name of DRIVER_PROFILES) {
    const origFilename = `${name}.png`;
    const slugFilename = getSlug(name);
    const srcPath = path.join(srcDir, origFilename);

    if (fs.existsSync(srcPath)) {
      // Replace in driverprofile/
      fs.copyFileSync(srcPath, path.join(destDriverProfile, origFilename));

      // Copy to frontend driver-assets
      fs.copyFileSync(srcPath, path.join(destFront, slugFilename));
      fs.copyFileSync(srcPath, path.join(destFront, origFilename));

      // Copy to backend uploads
      fs.copyFileSync(srcPath, path.join(destUploads, slugFilename));
      fs.copyFileSync(srcPath, path.join(destUploads, origFilename));

      const avatarUrl = `/driver-assets/${slugFilename}`;
      profileMap.set(normalizeName(name), avatarUrl);
      console.log(`  ✓ Replaced compressed image: "${name}" -> ${avatarUrl}`);
    } else {
      console.warn(`  ⚠️ Warning: Source image missing at ${srcPath}`);
    }
  }

  console.log('\n🔍 Updating drivers in database (if available)...');
  const prisma = new PrismaClient();
  try {
    const drivers = await prisma.driver.findMany({
      where: { deletedAt: null },
    });

    let updatedCount = 0;
    for (const d of drivers) {
      const fullName = normalizeName(`${d.first_name || ''} ${d.last_name || ''}`);
      let matchedAvatarUrl: string | undefined = undefined;

      for (const [keyName, avatarUrl] of profileMap.entries()) {
        if (fullName === keyName || fullName.includes(keyName) || keyName.includes(fullName)) {
          matchedAvatarUrl = avatarUrl;
          break;
        }
      }

      if (matchedAvatarUrl) {
        await prisma.driver.update({
          where: { id: d.id },
          data: { avatar_url: matchedAvatarUrl },
        });
        console.log(`  ✅ Updated Driver [${d.ref_id || d.id}] "${d.first_name} ${d.last_name}" -> ${matchedAvatarUrl}`);
        updatedCount++;
      }
    }
    console.log(`\n🎉 Successfully updated ${updatedCount} driver profile avatars in database.`);
  } catch (err: any) {
    console.log('  ℹ️ Database connection not reachable at present. Frontend fallback map will serve profile images dynamically.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Error executing update script:', e);
});
