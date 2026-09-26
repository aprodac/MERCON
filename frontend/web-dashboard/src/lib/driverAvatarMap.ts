import { resolveFileUrl } from './documents';

export interface DriverAvatarMapping {
  keywords: string[];
  avatarUrl: string;
}

export const DRIVER_AVATAR_MAP: DriverAvatarMapping[] = [
  {
    keywords: ['KASHIF ALI MUHAMMED ASLAM', 'KASHIF ALI'],
    avatarUrl: '/driver-assets/kashif_ali_muhammed_aslam.png',
  },
  {
    keywords: ['LIAQAT ALI MUHAMMED SULTAN', 'LIAQAT ALI'],
    avatarUrl: '/driver-assets/liaqat_ali_muhammed_sultan.png',
  },
  {
    keywords: ['MOHAMMED FAIZAN FAIZ AHMED', 'MOHAMMED FAIZAN', 'FAIZAN FAIZ'],
    avatarUrl: '/driver-assets/mohammed_faizan_faiz_ahmed.png',
  },
  {
    keywords: ['MOHAMMED IQBAL HOSSAIN', 'MOHAMMED IQBAL', 'IQBAL HOSSAIN'],
    avatarUrl: '/driver-assets/mohammed_iqbal_hossain.png',
  },
  {
    keywords: ['MUHAMMAD YASIN KHAIR DIN', 'MUHAMMAD YASIN', 'YASIN KHAIR DIN'],
    avatarUrl: '/driver-assets/muhammad_yasin_khair_din.png',
  },
  {
    keywords: ['MUHAMMED ABRAR ABDUL KAREEM', 'ABRAR ABDUL KAREEM', 'MUHAMMED ABRAR'],
    avatarUrl: '/driver-assets/muhammed_abrar_abdul_kareem.png',
  },
  {
    keywords: ['MUHAMMED RIZWAN MAQSOOD AHMAD', 'MUHAMMED RIZWAN', 'RIZWAN MAQSOOD'],
    avatarUrl: '/driver-assets/muhammed_rizwan_maqsood_ahmad.png',
  },
  {
    keywords: ['MUHAMMED SHAHBAZ MUHAMMAD TAZ', 'MUHAMMED SHAHBAZ', 'SHAHBAZ MUHAMMAD TAZ'],
    avatarUrl: '/driver-assets/muhammed_shahbaz_muhammad_taz.png',
  },
  {
    keywords: ['MUHAMMED SHAHZAD MUHAMMED AYUB BAIG', 'MUHAMMED SHAHZAD', 'SHAHZAD MUHAMMED AYUB'],
    avatarUrl: '/driver-assets/muhammed_shahzad_muhammed_ayub_baig.png',
  },
  {
    keywords: ['MUHAMMED UMAIR MUHAMMED ALI', 'MUHAMMED UMAIR', 'UMAIR MUHAMMED ALI'],
    avatarUrl: '/driver-assets/muhammed_umair_muhammed_ali.png',
  },
  {
    keywords: ['NADAR KHAN GUL SHAHZADA', 'NADAR KHAN'],
    avatarUrl: '/driver-assets/nadar_khan_gul_shahzada.png',
  },
  {
    keywords: ['NASEEBULLAH TAJ MANI KHAN', 'NASEEBULLAH'],
    avatarUrl: '/driver-assets/naseebullah_taj_mani_khan.png',
  },
  {
    keywords: ['NOUMAN ASHRAF MUHAMMED ASHRAF', 'NOUMAN ASHRAF'],
    avatarUrl: '/driver-assets/nouman_ashraf_muhammed_ashraf.png',
  },
  {
    keywords: ['RABIAZ KHAN SHAH QIAZ KHAN', 'RABIAZ KHAN'],
    avatarUrl: '/driver-assets/rabiaz_khan_shah_qiaz_khan.png',
  },
  {
    keywords: ['SAFI ULLAH AKHTAR ALI', 'SAFI ULLAH', 'SAFIULLAH'],
    avatarUrl: '/driver-assets/safi_ullah_akhtar_ali.png',
  },
  {
    keywords: ['SALEEM TAHA KHAN', 'SALEEM TAHA'],
    avatarUrl: '/driver-assets/saleem_taha_khan.png',
  },
  {
    keywords: ['SAWAB KHAN TAJ MANI KHAN', 'SAWAB KHAN'],
    avatarUrl: '/driver-assets/sawab_khan_taj_mani_khan.png',
  },
  {
    keywords: ['UMAR FAROOQ MUHAMMED BASHIR', 'UMAR FAROOQ', 'FAROOQ MUHAMMED BASHIR'],
    avatarUrl: '/driver-assets/umar_farooq_muhammed_bashir.png',
  },
  {
    keywords: ['USMAN HABIB HABIB KHAN', 'USMAN HABIB'],
    avatarUrl: '/driver-assets/usman_habib_habib_khan.png',
  },
  {
    keywords: ['WASEEM AKRAM RAB NAWAZ', 'WASEEM AKRAM'],
    avatarUrl: '/driver-assets/waseem_akram_rab_nawaz.png',
  },
  {
    keywords: ['WISAL ZAR SAID', 'WISAL ZAR'],
    avatarUrl: '/driver-assets/wisal_zar_said.png',
  },
  {
    keywords: ['ABDUL MALIK MALIK', 'ABDUL MALIK'],
    avatarUrl: '/driver-assets/abdul_malik.jpg',
  },
];

/**
 * Resolves a driver's avatar image URL.
 * First checks explicit `src` / `avatarUrl`, resolving backend uploads / relative paths.
 * If missing, checks the driver's name against known profile photo mappings.
 */
export function getDriverAvatar(src?: string | null, fullName?: string): string | undefined {
  if (src && src.trim()) {
    return resolveFileUrl(src);
  }
  if (!fullName || !fullName.trim()) return undefined;

  const normalized = fullName.toUpperCase().replace(/\s+/g, ' ').trim();

  for (const entry of DRIVER_AVATAR_MAP) {
    for (const kw of entry.keywords) {
      if (normalized.includes(kw.toUpperCase().trim())) {
        return entry.avatarUrl;
      }
    }
  }

  return undefined;
}
