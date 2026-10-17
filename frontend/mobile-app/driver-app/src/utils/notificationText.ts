/** Driver notifications in the app's language — the shared wording (also used for pushes). */
import { localizeDriverNotification } from '@mercon/shared-types';
import type { LanguageMode } from '@mercon/mobile-shared/lib/translations';

export const localizeNotification = <T extends { type: string; title: string; message: string }>(n: T, language: LanguageMode): T =>
  localizeDriverNotification(n, language);
