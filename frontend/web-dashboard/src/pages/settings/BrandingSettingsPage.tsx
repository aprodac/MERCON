import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Upload } from 'lucide-react';

import { SettingsPage, SettingsRow, SettingsSection } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { settingsService } from '@/services/settingsService';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const PRESET_PALETTES = [
  { name: 'Coral (default)', primary: '#FA634E', charcoal: '#3E3C3D' },
  { name: 'Emerald', primary: '#10B981', charcoal: '#1F2937' },
  { name: 'Sapphire', primary: '#2563EB', charcoal: '#1E293B' },
  { name: 'Violet', primary: '#7C3AED', charcoal: '#2E1065' },
  { name: 'Amber', primary: '#D97706', charcoal: '#262626' },
];

export default function BrandingSettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const [primaryColor, setPrimaryColor] = useState('#FA634E');
  const [appName, setAppName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [statusGreen, setStatusGreen] = useState('#10B981');
  const [statusAmber, setStatusAmber] = useState('#F59E0B');
  const [statusRed, setStatusRed] = useState('#EF4444');
  const [statusBlue, setStatusBlue] = useState('#3B82F6');

  useEffect(() => {
    if (settings) {
      setPrimaryColor(settings.primaryColor || '#FA634E');
      setAppName(settings.appName || '');
      setLogoUrl(settings.logoUrl || '');

      const theme = ((settings as any).themeColors) || {};
      if (theme.statusGreen) setStatusGreen(theme.statusGreen);
      if (theme.statusAmber) setStatusAmber(theme.statusAmber);
      if (theme.statusRed) setStatusRed(theme.statusRed);
      if (theme.statusBlue) setStatusBlue(theme.statusBlue);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => settingsService.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      toast.success('Branding saved');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update branding settings');
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      primaryColor,
      appName,
      logoUrl,
      themeColors: {
        statusGreen,
        statusAmber,
        statusRed,
        statusBlue,
      },
    });
  };

  const applyPreset = (preset: (typeof PRESET_PALETTES)[number]) => {
    setPrimaryColor(preset.primary);
  };

  const uploadLogo = useMutation({
    mutationFn: (file: File) => settingsService.uploadLogo(file),
    onSuccess: (url) => {
      setLogoUrl(url);
      toast.success('Logo uploaded. Save to apply it.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Upload failed'),
  });

  const statusColors: { label: string; hint: string; value: string; set: (v: string) => void }[] = [
    { label: 'Good', hint: 'Active, valid, completed', value: statusGreen, set: setStatusGreen },
    { label: 'Warning', hint: 'Delayed, expiring soon', value: statusAmber, set: setStatusAmber },
    { label: 'Problem', hint: 'Expired, failed', value: statusRed, set: setStatusRed },
    { label: 'Info', hint: 'Scheduled, informational', value: statusBlue, set: setStatusBlue },
  ];

  const colorField = (id: string, value: string, set: (v: string) => void) => (
    <div className="flex items-center gap-2">
      <input
        id={`${id}-picker`}
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={(e) => set(e.target.value.toUpperCase())}
        aria-label={`${id} color picker`}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-black/[0.08] bg-card p-1"
      />
      <Input id={id} value={value} onChange={(e) => set(e.target.value)} className="h-9 w-28 font-mono text-xs uppercase" maxLength={7} />
    </div>
  );

  return (
    <SettingsPage
      title="Branding"
      description="The name, logo and colours people see across the dashboard. Mobile app icons are set per client build, not here."
      actions={<Btn label="Save" isLoading={updateMutation.isPending} onClick={handleSave} />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <SettingsSection title="Identity">
            <SettingsRow label="Product name" description="Shown in the header, the login page and browser tab." htmlFor="app-name">
              <Input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} className="h-9 w-full sm:w-[260px]" placeholder="Operations Platform" />
            </SettingsRow>
            <SettingsRow label="Logo" description="PNG, JPG or WebP. Leave empty to show the product name instead." htmlFor="logo-url">
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] bg-muted">
                  {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] font-bold text-muted-foreground">—</span>}
                </span>
                <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="h-9 w-full sm:w-[180px]" placeholder="Image link" />
                <input
                  id="logo-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) uploadLogo.mutate(file);
                  }}
                />
                <Btn label="Upload" variant="outline" size="sm" icon={<Upload size={13} />} isLoading={uploadLogo.isPending} onClick={() => document.getElementById('logo-file')?.click()} />
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Brand colour" description="Used for primary buttons, links and the active menu item.">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour presets">
              {PRESET_PALETTES.map((preset) => {
                const selected = primaryColor.toLowerCase() === preset.primary.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'inline-flex items-center gap-2 h-9 pl-2 pr-3 rounded-full border text-xs font-bold transition-colors',
                      selected ? 'border-foreground text-foreground' : 'border-black/[0.08] text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: preset.primary }}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {preset.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-black/[0.05]">
              <SettingsRow label="Custom colour" description="Any hex colour, e.g. #FA634E." htmlFor="brand-color">
                {colorField('brand-color', primaryColor, setPrimaryColor)}
              </SettingsRow>
            </div>
          </SettingsSection>

          <SettingsSection title="Status colours" description="Used by status badges on trips, drivers, documents and rate cards.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {statusColors.map((c) => (
                <div key={c.label} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <label htmlFor={`status-${c.label}`} className="block text-sm font-semibold text-foreground">{c.label}</label>
                    <p className="text-xs text-muted-foreground truncate">{c.hint}</p>
                  </div>
                  {colorField(`status-${c.label}`, c.value, c.set)}
                </div>
              ))}
            </div>
          </SettingsSection>
        </div>

        <aside className="lg:sticky lg:top-4">
          <SettingsSection title="Preview">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#3E3C3D] px-3 py-2.5 text-white">
                <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-5 max-w-[80px] object-contain" />
                  ) : (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: primaryColor }} />
                  )}
                  <span className="truncate">{appName || 'Product name'}</span>
                </span>
                <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: primaryColor }} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ backgroundColor: primaryColor }} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white">
                  New trip
                </span>
                <span className="rounded-lg border border-black/[0.08] px-3 py-1.5 text-xs font-bold text-foreground">Export</span>
                <span style={{ color: primaryColor }} className="text-xs font-bold">View details</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Active', statusGreen],
                  ['Delayed', statusAmber],
                  ['Expired', statusRed],
                  ['Scheduled', statusBlue],
                ].map(([label, color]) => (
                  <span key={label} style={{ backgroundColor: `${color}15`, color, borderColor: `${color}40` }} className="rounded-md border px-2 py-0.5 text-xs font-bold">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </SettingsSection>
        </aside>
      </div>
    </SettingsPage>
  );
}
