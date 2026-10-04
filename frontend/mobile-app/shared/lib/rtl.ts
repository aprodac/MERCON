import { I18nManager } from 'react-native';

/**
 * For arrows and chevrons that mean "back" or "forward": mirrored when the
 * layout is right-to-left (the driver app in Urdu). React Native mirrors the
 * layout itself but not icons, so a back arrow would still point left.
 *
 * Direction only changes after an app restart (see language-context), so this
 * is read once.
 */
export const flipInRTL = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
