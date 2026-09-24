import { NativeModules, Platform, Vibration } from 'react-native';

// Embedded high-quality double-chime WAV audio (E5 -> B5 Google Pay style success sound)
const GPAY_CHIME_WAV =
  'data:audio/wav;base64,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/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8EgQSNA7EDEAN/AmoBfADQ/zz/o/7x/1r9s/yB/HH8e/yc/cf+7/9sAfECuAN7BI8Eg...';

function isNativeModuleAvailable(moduleName: string): boolean {
  try {
    if (Platform.OS === 'web') return false;
    const expoModules = (globalThis as any).ExpoModules;
    if (expoModules) {
      if (typeof expoModules.hasModule === 'function' && expoModules.hasModule(moduleName)) {
        return true;
      }
      if (expoModules[moduleName]) return true;
    }
    if (NativeModules && NativeModules[moduleName]) return true;
    return false;
  } catch (_) {
    return false;
  }
}



let HapticsModule: any = null;
let hapticsAttempted = false;

function getHaptics() {
  if (hapticsAttempted) return HapticsModule;
  hapticsAttempted = true;

  if (!isNativeModuleAvailable('ExpoHaptics')) {
    HapticsModule = null;
    return null;
  }

  try {
    HapticsModule = require('expo-haptics');
  } catch (_) {
    HapticsModule = null;
  }
  return HapticsModule;
}

function synthWebAudioFallback() {
  try {
    const AudioContext =
      (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0.25, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.24);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, ctx.currentTime + 0.09);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.46);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.09);
      osc2.stop(ctx.currentTime + 0.46);
    }
  } catch (_) {}
}

/**
 * Plays the Google Pay style success chime audio safely.
 */
export async function playSuccessSound() {
  // Fallback to Web Audio / HTML5 Audio
  if (typeof window !== 'undefined' && (window as any).Audio) {
    try {
      const audio = new (window as any).Audio(GPAY_CHIME_WAV);
      audio.play().catch(() => {
        synthWebAudioFallback();
      });
    } catch (_) {
      synthWebAudioFallback();
    }
  } else {
    synthWebAudioFallback();
  }
}

/**
 * Triggers haptic vibration and Google Pay style success audio chime safely.
 */
export async function triggerGPayHapticsAndSound() {
  // 1. Haptic feedback
  try {
    const Haptics = getHaptics();
    if (Haptics && Haptics.notificationAsync && Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Vibration.vibrate([0, 40, 50, 60]);
    }
  } catch (_) {
    try {
      Vibration.vibrate([0, 40, 50, 60]);
    } catch (_) {}
  }

  // 2. Audio feedback
  await playSuccessSound();
}
