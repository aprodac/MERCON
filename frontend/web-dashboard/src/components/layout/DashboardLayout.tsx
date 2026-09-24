import { useEffect, useState, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useLayoutMeta } from '@/context/LayoutContext';

interface DashboardLayoutProps {
  active: string;
  title: string;
  icon?: React.ReactNode;
  breadcrumb?: string;
  pageTitle?: React.ReactNode;
  pageSub?: string;
  actions?: React.ReactNode;
  hideBackButton?: boolean;
  hideHeader?: boolean;
  onBackClick?: () => void;
  fixedViewport?: boolean;
  children: React.ReactNode;
}

export default function DashboardLayout({
  active,
  title,
  icon,
  breadcrumb,
  pageTitle,
  pageSub,
  actions,
  hideBackButton,
  hideHeader,
  onBackClick,
  fixedViewport,
  children,
}: DashboardLayoutProps) {
  const { isInsideShell, setMeta } = useLayoutMeta();

  // ── When inside AppShell: push metadata up and render only the content ──
  // The shell already owns the sidebar, header, and scroll container.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (isInsideShell) {
      setMeta({ active, title, icon, breadcrumb, pageTitle, pageSub, actions, hideBackButton, hideHeader, onBackClick, fixedViewport });
    }
  }, [isInsideShell, active, title, icon, breadcrumb, pageSub, hideBackButton, hideHeader, onBackClick, fixedViewport]);

  if (isInsideShell) {
    // Shell is already rendering the sidebar/header — just return the content.
    return <>{children}</>;
  }

  // ── Standalone mode (fallback): render the full shell inline ────────────
  return <StandaloneShell {...{ active, title, icon, breadcrumb, pageTitle, pageSub, actions, hideBackButton, onBackClick, children }} />;
}

/** Full standalone shell — only used when AppShell is not the parent route. */
function StandaloneShell({
  active,
  title,
  icon,
  breadcrumb,
  hideBackButton,
  onBackClick,
  children,
}: DashboardLayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F8FAFC]">
      <Sidebar
        active={active}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 bg-[#F8FAFC]">
        <Header
          title={title}
          icon={icon}
          breadcrumb={breadcrumb}
          hideBackButton={hideBackButton}
          onBackClick={onBackClick}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 relative pt-4 sm:pt-6 bg-[#F8FAFC]">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div style={{
                width: 32, height: 32,
                border: '3px solid #F0F0F2',
                borderTopColor: 'var(--color-brand)',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          }>
            {children}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
