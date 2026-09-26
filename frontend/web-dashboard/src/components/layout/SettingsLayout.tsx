import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

import { useNavAccess } from '@/hooks/useNavAccess';
import { SETTINGS_GROUPS, SETTINGS_PAGES, findActiveEntry } from '@/config/navigation';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Settings area: an inner navigation beside every settings-area page (system settings, users, master data,
 * safety tools, the Aprodac vault). URLs and route guards are unchanged — this only adds the shared nav.
 */
export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useNavAccess();

  const entries = SETTINGS_PAGES.map((p) => ({ page: p, state: access(p) })).filter((x) => x.state !== 'hidden');
  const active = findActiveEntry(SETTINGS_PAGES, location.pathname);

  const groups = SETTINGS_GROUPS.map((g) => ({ ...g, items: entries.filter((e) => e.page.settingsGroup === g.id) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="flex min-h-full">
      {/* Desktop inner nav */}
      <aside className="hidden lg:block w-56 shrink-0 border-r border-border bg-background/60">
        <nav aria-label="Settings" className="sticky top-0 px-3 py-4 space-y-4">
          <p className="px-2.5 text-[15px] font-semibold text-foreground">Settings</p>
          {groups.map((g) => (
            <div key={g.id}>
              <p className="px-2.5 mb-1 text-[11px] font-medium text-muted-foreground">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map(({ page, state }) => {
                  const isActive = active?.id === page.id;
                  if (state === 'locked') {
                    return (
                      <div
                        key={page.id}
                        aria-disabled="true"
                        title={`${page.label} — module disabled`}
                        className="flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium text-muted-foreground/50 cursor-not-allowed"
                      >
                        <page.icon size={15} strokeWidth={1.75} />
                        <span className="flex-1 truncate">{page.label}</span>
                        <Lock size={12} />
                      </div>
                    );
                  }
                  return (
                    <NavLink
                      key={page.id}
                      to={page.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium outline-none transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-ring',
                        isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <page.icon size={15} strokeWidth={1.75} className={isActive ? 'text-[#FA634E]' : ''} />
                      <span className="flex-1 truncate">{page.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile: a select replaces the inner nav */}
        <div className="lg:hidden px-4 pt-2 pb-1">
          <Select value={active?.id} onValueChange={(id) => {
            const target = SETTINGS_PAGES.find((p) => p.id === id);
            if (target) navigate(target.path);
          }}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Settings" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectGroup key={g.id}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.items.map(({ page, state }) => (
                    <SelectItem key={page.id} value={page.id} disabled={state === 'locked'}>
                      {page.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
