/**
 * Driver notifications in Urdu. The server writes them in English (it doesn't
 * know the phone's language), so in Urdu the list showed English titles under
 * Urdu headings (TestFlight feedback "Not showing in urdu"). Known types are
 * rewritten here from the trip number in the text; anything else stays as sent.
 * In "Urdu + English" the English line is kept under the Urdu one.
 */
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import type { LanguageMode } from '@mercon/mobile-shared/lib/translations';

const refOf = (text: string) => text.match(/TRP-[A-Za-z0-9-]+/)?.[0] ?? '';
const minutesOf = (text: string) => text.match(/(\d+)\s*minute/)?.[1] ?? null;

function urdu(n: Pick<AppNotification, 'type' | 'title' | 'message'>): { title: string; message: string } | null {
  const ref = refOf(`${n.title} ${n.message}`);
  const trip = ref ? `ٹرپ ${ref}` : 'آپ کا ٹرپ';
  switch (n.type) {
    case 'TripAssigned':
      return { title: 'نیا ٹرپ ملا', message: `آپ کو ${trip} دیا گیا ہے۔ شروع کرنے کے لیے ایپ کھولیں۔` };
    case 'TripStartingSoon': {
      const min = minutesOf(n.message);
      return { title: 'ٹرپ جلد شروع ہو رہا ہے', message: `${trip} ${min ? `${min} منٹ میں` : 'جلد'} شروع ہو رہا ہے۔ تیاری کے لیے ایپ کھولیں۔` };
    }
    case 'TripCancelled':
      return { title: 'ٹرپ منسوخ', message: `${trip} منسوخ کر دیا گیا ہے۔` };
    case 'TripReassigned':
      return { title: 'ٹرپ واپس لے لیا گیا', message: `${trip} اب آپ کے ذمے نہیں ہے۔` };
    case 'TripRouteChanged':
      return { title: 'ٹرپ کا راستہ بدل گیا', message: `${trip} کا راستہ بدل دیا گیا ہے۔ اپنے اسٹاپ دیکھیں۔` };
    case 'TripSteppedBack':
      return n.title.toLowerCase().includes('moved on')
        ? { title: 'دفتر نے ٹرپ آگے بڑھایا', message: 'دفتر نے آپ کے ٹرپ کا اگلا مرحلہ مکمل کر دیا۔ ایپ میں اگلا مرحلہ دیکھیں۔' }
        : { title: 'دفتر نے ٹرپ کا مرحلہ واپس کیا', message: 'دفتر نے آپ کا ٹرپ پچھلے مرحلے پر واپس کر دیا۔ ایپ میں موجودہ مرحلہ دیکھیں۔' };
    case 'TripDelayPrompt': {
      const min = minutesOf(n.message);
      return { title: 'ٹرپ میں تاخیر', message: `آپ کا ٹرپ ${min ? `${min} منٹ ` : ''}تاخیر سے ہے۔ براہ کرم تاخیر کی وجہ بتائیں۔` };
    }
    default:
      return null;
  }
}

/** The notification as the driver's language shows it. */
export function localizeNotification<T extends Pick<AppNotification, 'type' | 'title' | 'message'>>(n: T, language: LanguageMode): T {
  if (language === 'en') return n;
  const ur = urdu(n);
  if (!ur) return n;
  return language === 'ur'
    ? { ...n, title: ur.title, message: ur.message }
    : { ...n, title: ur.title, message: `${ur.message}\n${n.message}` };
}
