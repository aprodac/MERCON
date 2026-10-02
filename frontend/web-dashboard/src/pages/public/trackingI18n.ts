import { useCallback, useEffect, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { arSA } from 'date-fns/locale';

/**
 * English / Arabic for the customer tracking pages (/t/ and /c/) — many of the
 * customers' warehouse staff read Arabic. Only these public pages are
 * translated; place names stay as ops typed them.
 */
export type TrackingLang = 'en' | 'ar';

const STORE_KEY = 'mercon.tracking.lang';

const EN = {
  finding: 'Finding your truck…',
  loadFailed: "We couldn't load this tracking link. Check your connection and try again.",
  onTheWay: 'On the way',
  stopped: 'Stopped',
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  live: 'Live',
  lastSeen: 'Last seen',
  noLiveYet: 'No live location yet',
  arrivesAt: 'Arrives at',
  arrivesForLoading: 'Truck arrives for loading at',
  in: 'in',
  thenMore: (n: number) => `then ${n} more ${n === 1 ? 'stop' : 'stops'}`,
  deliveredAll: 'Delivered — all stops completed',
  startsAt: 'Starts',
  soon: 'The truck will be on its way soon.',
  staleSub: (ago: string) => `Last location ${ago}. The arrival time comes back when the truck reports again.`,
  noPosSub: "This truck's live location isn't available right now.",
  noRouteSub: "We couldn't work out the arrival time just now. It'll update shortly.",
  done: 'done',
  toGo: 'to go',
  loading: 'Loading',
  delivery: 'Delivery',
  stop: 'Stop',
  arrived: 'Arrived',
  left: 'left',
  nextStop: 'next stop',
  eta: 'ETA',
  due: 'Due',
  onTime: 'On time',
  lateBy: (d: string) => `Late by ${d}`,
  arrivedLate: (d: string) => `arrived ${d} late`,
  expectedLate: (d: string) => `Expected ${d} late`,
  delayed: 'Delayed',
  photos: 'Photos',
  truck: 'Truck',
  driver: 'Driver',
  trip: 'Trip',
  updated: (ago: string) => `Updated ${ago} · refreshes on its own`,
  refresh: 'Refresh',
  sharedBy: (b: string) => `Shared by ${b}`,
  ask: (b: string) => `Ask ${b}`,
  askText: (ref: string) => `Hi, about ${ref}: `,
  showAll: 'Show the whole trip',
  close: 'Close',
  trucksOnRoad: (n: number) => `${n} on the road`,
  loadingSoon: (n: number) => `${n} loading soon`,
  deliveredToday: (n: number) => `${n} delivered`,
  noTrucks: 'No trucks on the road right now. Trucks show here when they are about to load.',
  liveTrucks: 'Live trucks',
  openTrip: 'Open',
  to: 'to',
  stopsDone: (a: number, b: number) => `${a} of ${b} stops done`,
  scheduledFor: 'Scheduled',
  startedAt: 'Started',
  toPlace: (p: string) => `To ${p}`,
  notReportingTitle: "The truck isn't sending its location",
  notReportingStale: (ago: string, at: string) => `Last location ${ago} (${at}). The arrival time comes back as soon as the truck reports again.`,
  notReportingNone: "We don't have a live location for this truck yet.",
  needUpdate: 'Need an update now? Message us — we\'ll check with the driver.',
  updatedAgo: (ago: string) => `Updated ${ago}`,
  search: 'Search plate, trip or place',
  allRoutes: 'All routes',
  noMatch: 'No trucks match your search.',
  deliveredRecently: 'Delivered — last 7 days',
  noDelivered: 'No deliveries in the last 7 days.',
  deliveredAt: (at: string) => `Delivered ${at}`,
  allTrucks: 'All trucks',
  showMore: 'Show more',
  showMap: 'Show the map',
  language: 'عربي',
  hoursShort: 'h',
  minutesShort: 'min',
  km: 'km',
  ago: {
    s: (n: number) => `${n}s ago`, m: (n: number) => `${n}m ago`, h: (n: number) => `${n}h ago`, d: (n: number) => `${n}d ago`, never: 'never',
  },
  delayReasons: {
    Traffic: 'Traffic', VehicleBreakdown: 'Vehicle breakdown', CustomerNotReady: 'Waiting at the site', SlowLoadingUnloading: 'Slow loading / unloading',
    Weather: 'Weather', Documentation: 'Paperwork', RouteBlocked: 'Road closed', Other: 'Other',
  } as Record<string, string>,
};

type Dict = typeof EN;

const AR: Dict = {
  finding: 'جارٍ البحث عن شاحنتك…',
  loadFailed: 'تعذّر تحميل رابط التتبع. تحقّق من الاتصال وحاول مرة أخرى.',
  onTheWay: 'في الطريق',
  stopped: 'متوقفة',
  scheduled: 'مجدولة',
  delivered: 'تم التسليم',
  cancelled: 'ملغاة',
  live: 'مباشر',
  lastSeen: 'آخر ظهور',
  noLiveYet: 'لا يوجد موقع مباشر بعد',
  arrivesAt: 'تصل إلى',
  arrivesForLoading: 'تصل الشاحنة للتحميل في',
  in: 'خلال',
  thenMore: (n: number) => (n === 1 ? 'ثم محطة واحدة أخرى' : `ثم ${n} محطات أخرى`),
  deliveredAll: 'تم التسليم — اكتملت جميع المحطات',
  startsAt: 'تبدأ',
  soon: 'ستنطلق الشاحنة قريبًا.',
  staleSub: (ago: string) => `آخر موقع ${ago}. سيظهر وقت الوصول عندما ترسل الشاحنة موقعها مجددًا.`,
  noPosSub: 'الموقع المباشر لهذه الشاحنة غير متاح حاليًا.',
  noRouteSub: 'تعذّر حساب وقت الوصول الآن. سيتم التحديث قريبًا.',
  done: 'تم قطعها',
  toGo: 'متبقية',
  loading: 'تحميل',
  delivery: 'تسليم',
  stop: 'محطة',
  arrived: 'وصلت',
  left: 'غادرت',
  nextStop: 'المحطة التالية',
  eta: 'الوصول المتوقع',
  due: 'الموعد',
  onTime: 'في الموعد',
  lateBy: (d: string) => `متأخرة ${d}`,
  arrivedLate: (d: string) => `وصلت متأخرة ${d}`,
  expectedLate: (d: string) => `يُتوقع التأخر ${d}`,
  delayed: 'متأخرة',
  photos: 'الصور',
  truck: 'الشاحنة',
  driver: 'السائق',
  trip: 'الرحلة',
  updated: (ago: string) => `آخر تحديث ${ago} · يتحدّث تلقائيًا`,
  refresh: 'تحديث',
  sharedBy: (b: string) => `مشاركة من ${b}`,
  ask: (b: string) => `تواصل مع ${b}`,
  askText: (ref: string) => `مرحبًا، بخصوص ${ref}: `,
  showAll: 'عرض الرحلة كاملة',
  close: 'إغلاق',
  trucksOnRoad: (n: number) => `${n} في الطريق`,
  loadingSoon: (n: number) => `${n} تحميل قريبًا`,
  deliveredToday: (n: number) => `${n} تم تسليمها`,
  noTrucks: 'لا توجد شاحنات في الطريق الآن. تظهر الشاحنات هنا عندما تقترب من التحميل.',
  liveTrucks: 'الشاحنات المباشرة',
  openTrip: 'فتح',
  to: 'إلى',
  stopsDone: (a: number, b: number) => `${a} من ${b} محطات مكتملة`,
  scheduledFor: 'مجدولة',
  startedAt: 'بدأت',
  toPlace: (p: string) => `إلى ${p}`,
  notReportingTitle: 'الشاحنة لا ترسل موقعها حاليًا',
  notReportingStale: (ago: string, at: string) => `آخر موقع ${ago} (${at}). سيظهر وقت الوصول فور إرسال الشاحنة موقعها مجددًا.`,
  notReportingNone: 'لا يوجد موقع مباشر لهذه الشاحنة بعد.',
  needUpdate: 'تحتاج تحديثًا الآن؟ راسلنا وسنتواصل مع السائق.',
  updatedAgo: (ago: string) => `آخر تحديث ${ago}`,
  search: 'ابحث برقم اللوحة أو الرحلة أو المكان',
  allRoutes: 'كل المسارات',
  noMatch: 'لا توجد شاحنات مطابقة للبحث.',
  deliveredRecently: 'تم التسليم — آخر 7 أيام',
  noDelivered: 'لا توجد عمليات تسليم في آخر 7 أيام.',
  deliveredAt: (at: string) => `تم التسليم ${at}`,
  allTrucks: 'كل الشاحنات',
  showMore: 'عرض المزيد',
  showMap: 'عرض الخريطة',
  language: 'English',
  hoursShort: 'س',
  minutesShort: 'د',
  km: 'كم',
  ago: {
    s: (n: number) => `قبل ${n} ث`, m: (n: number) => `قبل ${n} د`, h: (n: number) => `قبل ${n} س`, d: (n: number) => `قبل ${n} يوم`, never: 'أبدًا',
  },
  delayReasons: {
    Traffic: 'ازدحام مروري', VehicleBreakdown: 'عطل في الشاحنة', CustomerNotReady: 'انتظار في الموقع', SlowLoadingUnloading: 'بطء التحميل / التفريغ',
    Weather: 'الطقس', Documentation: 'أوراق ومستندات', RouteBlocked: 'طريق مغلق', Other: 'أخرى',
  },
};

function initialLang(): TrackingLang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch { /* storage blocked */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** Language, text and formatters for a tracking page. Remembers the choice on this device. */
export function useTrackingText(timezone: string) {
  const [lang, setLang] = useState<TrackingLang>(initialLang);
  const t = lang === 'ar' ? AR : EN;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    return () => {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
    };
  }, [lang]);

  const toggle = useCallback(() => {
    setLang((l) => {
      const next = l === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem(STORE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /** "21:15" today, "Thu 2 Oct, 21:15" on another day — in the company's timezone. */
  const clock = useCallback((iso: string) => {
    const locale = lang === 'ar' ? { locale: arSA } : undefined;
    const sameDay = formatInTimeZone(new Date(iso), timezone, 'yyyy-MM-dd') === formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
    return formatInTimeZone(new Date(iso), timezone, sameDay ? 'HH:mm' : 'EEE d MMM, HH:mm', locale);
  }, [lang, timezone]);

  const duration = useCallback((seconds: number) => {
    const mins = Math.max(1, Math.round(seconds / 60));
    if (mins < 60) return `${mins} ${t.minutesShort}`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} ${t.hoursShort} ${m} ${t.minutesShort}` : `${h} ${t.hoursShort}`;
  }, [t]);

  const km = useCallback((meters: number) => {
    const k = meters / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)} ${t.km}`;
  }, [t]);

  const ago = useCallback((iso: string | null | undefined) => {
    if (!iso) return t.ago.never;
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return t.ago.s(s);
    if (s < 3600) return t.ago.m(Math.floor(s / 60));
    if (s < 86400) return t.ago.h(Math.floor(s / 3600));
    return t.ago.d(Math.floor(s / 86400));
  }, [t]);

  const delayReason = useCallback((reason: string) => t.delayReasons[reason] ?? t.delayReasons.Other, [t]);

  return { lang, t, toggle, clock, duration, km, ago, delayReason, rtl: lang === 'ar' };
}

export type TrackingText = ReturnType<typeof useTrackingText>;
