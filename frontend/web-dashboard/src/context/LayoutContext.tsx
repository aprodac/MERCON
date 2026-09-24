import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export interface LayoutMeta {
  active: string;
  title: string;
  icon?: ReactNode;
  breadcrumb?: string;
  pageTitle?: ReactNode;
  pageSub?: string;
  actions?: ReactNode;
  hideBackButton?: boolean;
  hideHeader?: boolean;
  onBackClick?: () => void;
  /** When true, the AppShell content area switches to overflow-hidden for a locked one-page viewport */
  fixedViewport?: boolean;
}

interface LayoutContextValue {
  meta: LayoutMeta;
  setMeta: (meta: LayoutMeta) => void;
  /** True when AppShell is the parent — DashboardLayout should not render its own shell */
  isInsideShell: boolean;
  isHeaderCollapsed: boolean;
  setIsHeaderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleHeaderCollapsed: () => void;
}

const defaultMeta: LayoutMeta = { active: '', title: '' };

const LayoutContext = createContext<LayoutContextValue>({
  meta: defaultMeta,
  setMeta: () => {},
  isInsideShell: false,
  isHeaderCollapsed: false,
  setIsHeaderCollapsed: () => {},
  toggleHeaderCollapsed: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [meta, setMetaState] = useState<LayoutMeta>(defaultMeta);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mercon_header_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleHeaderCollapsed = useCallback(() => {
    setIsHeaderCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mercon_header_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const setMeta = useCallback((m: LayoutMeta) => {
    setMetaState((prev) => {
      if (
        prev.active === m.active &&
        prev.title === m.title &&
        prev.icon === m.icon &&
        prev.breadcrumb === m.breadcrumb &&
        prev.hideBackButton === m.hideBackButton &&
        prev.hideHeader === m.hideHeader &&
        prev.pageSub === m.pageSub &&
        prev.pageTitle === m.pageTitle &&
        prev.actions === m.actions &&
        prev.onBackClick === m.onBackClick &&
        prev.fixedViewport === m.fixedViewport
      ) {
        return prev;
      }
      return m;
    });
  }, []);

  const value = useMemo(
    () => ({
      meta,
      setMeta,
      isInsideShell: true,
      isHeaderCollapsed,
      setIsHeaderCollapsed,
      toggleHeaderCollapsed,
    }),
    [meta, setMeta, isHeaderCollapsed, toggleHeaderCollapsed]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayoutMeta() {
  return useContext(LayoutContext);
}
