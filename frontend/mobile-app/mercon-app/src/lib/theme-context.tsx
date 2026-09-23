import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeSecureStore } from './secure-store';

const DARK_MODE_KEY = 'mercon_dark_mode';

interface ThemeContextValue {
  isDark: boolean;
  toggleDark: () => void;
  colors: typeof LIGHT;
}

const LIGHT = {
  bg: '#F4F4F5',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  textPrimary: '#18181B',
  textSecondary: '#71717A',
  textMuted: '#A1A1AA',
  iconBg: '#F4F4F5',
  separator: '#F4F4F5',
  cardShadow: '#000',
  statusBar: 'dark-content' as 'dark-content' | 'light-content',
  switchTrackOn: '#FA634E',
  switchThumb: '#FFFFFF',
  groupLabel: '#71717A',
  dangerText: '#DC2626',
};

const DARK = {
  bg: '#09090B',
  surface: '#18181B',
  border: '#27272A',
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  iconBg: '#27272A',
  separator: '#27272A',
  cardShadow: '#000',
  statusBar: 'light-content' as 'dark-content' | 'light-content',
  switchTrackOn: '#FA634E',
  switchThumb: '#FFFFFF',
  groupLabel: '#71717A',
  dangerText: '#F87171',
};

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggleDark: () => {},
  colors: LIGHT,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    safeSecureStore.getItemAsync(DARK_MODE_KEY).then((val: string | null) => {
      if (val === 'true') setIsDark(true);
    });
  }, []);

  const toggleDark = () => {
    setIsDark((prev) => {
      const next = !prev;
      safeSecureStore.setItemAsync(DARK_MODE_KEY, String(next));
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, colors: isDark ? DARK : LIGHT }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
