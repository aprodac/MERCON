import { useEffect, useState, useRef, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { LayoutProvider, useLayoutMeta } from '@/context/LayoutContext';
import OperationsAssistant from '../assistant/OperationsAssistant';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import CommandPalette from './CommandPalette';
import { NAV_PAGES, SETTINGS_PAGES, findActiveEntry } from '@/config/navigation';
import { navStore } from '@/lib/navigation/navStore';

const SIDEBAR_KEY = 'mercon_sidebar_collapsed';

/** Inner shell — reads metadata from context set by each page's DashboardLayout */
function ShellInner() {
  const location = useLocation();
  const { meta } = useLayoutMeta();
  const contentRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The sidebar starts collapsed each time the app is opened, leaving the room to
  // the page. Expanding it holds for the rest of this tab's session (across page
  // changes), then it's collapsed again next time — sessionStorage, not localStorage.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SIDEBAR_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {}
      return next;
    });
  };

  // Global shortcut (⌘B or Ctrl+B) to toggle rail mode on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-enter full screen on initial app load (fresh page load across all pages)
  useEffect(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    const handleFirstInteraction = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    window.addEventListener('click', handleFirstInteraction, { once: true, capture: true });
    return () => {
      window.removeEventListener('click', handleFirstInteraction, { capture: true });
    };
  }, []);

  // Close mobile drawer and reset scroll position on navigation; remember the page for ⌘K "Recent"
  useEffect(() => {
    setSidebarOpen(false);
    const visited = findActiveEntry([...NAV_PAGES, ...SETTINGS_PAGES], location.pathname);
    if (visited) navStore.pushRecent(visited.id);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [location.pathname, location.search]);

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [sidebarOpen]);

  // Escape closes the drawer
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const { isHeaderCollapsed, toggleHeaderCollapsed } = useLayoutMeta();

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar — stays mounted forever, never remounts on navigation */}
      <Sidebar
        active={meta.active}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      <div className="flex flex-col flex-1 min-w-0 bg-[#F8FAFC]">
        {!meta.hideHeader && !isHeaderCollapsed && (
          <Header
            title={meta.title}
            breadcrumb={meta.breadcrumb}
            hideBackButton={meta.hideBackButton}
            onBackClick={meta.onBackClick}
            onMenuClick={() => setSidebarOpen(true)}
          />
        )}

        {/* Collapsed Header Expand Banner */}
        {!meta.hideHeader && isHeaderCollapsed && (
          <div className="bg-charcoal text-white px-4 py-1 flex items-center justify-between text-xs shrink-0 animate-fade-in">
            <span className="font-bold text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Header navigation is collapsed to maximize vertical workspace height.
            </span>
            <button
              type="button"
              onClick={toggleHeaderCollapsed}
              className="text-[11px] font-bold text-brand hover:text-white bg-brand/20 hover:bg-brand px-2.5 py-0.5 rounded transition-all cursor-pointer"
            >
              ⤢ Expand Header
            </button>
          </div>
        )}

        {/* Content area — Suspense + ErrorBoundary ensures shell stays mounted and errors are isolated */}
        <div
          ref={contentRef}
          className={`flex-1 min-h-0 relative ${meta.hideHeader || isHeaderCollapsed ? 'pt-2 px-2 sm:px-4 sm:pt-3' : 'pt-2 sm:pt-3.5'} bg-[#F8FAFC] ${meta.fixedViewport ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
        >
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full min-h-[350px]">
                  <div className="flex flex-col items-center gap-3">
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        border: '3px solid #F0F0F2',
                        borderTopColor: 'var(--color-brand)',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase animate-pulse">
                      Loading...
                    </span>
                  </div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      {/* Floating Operations Assistant Overlay */}
      <OperationsAssistant />
      {/* ERP Keyboard Shortcuts Help Overlay */}
      <KeyboardShortcutsModal />
      {/* ⌘K / Ctrl+K navigation palette */}
      <CommandPalette />
    </div>
  );
}

export default function AppShell() {
  return (
    <LayoutProvider>
      <ShellInner />
    </LayoutProvider>
  );
}
