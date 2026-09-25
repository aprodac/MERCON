import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Palette, Save, Check, RefreshCw, Eye, Sparkles, Image, Shield } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { settingsService } from '@/services/settingsService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const PRESET_PALETTES = [
  { name: 'MERCON Coral (Default)', primary: '#FA634E', charcoal: '#3E3C3D' },
  { name: 'Emerald Logistics', primary: '#10B981', charcoal: '#1F2937' },
  { name: 'Sapphire Fleet', primary: '#2563EB', charcoal: '#1E293B' },
  { name: 'Violet Cargo', primary: '#7C3AED', charcoal: '#2E1065' },
  { name: 'Amber Operations', primary: '#D97706', charcoal: '#262626' },
];

export default function BrandingSettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const [primaryColor, setPrimaryColor] = useState('#FA634E');
  const [appName, setAppName] = useState('MERCON Logistics');
  const [logoUrl, setLogoUrl] = useState('');
  const [statusGreen, setStatusGreen] = useState('#10B981');
  const [statusAmber, setStatusAmber] = useState('#F59E0B');
  const [statusRed, setStatusRed] = useState('#EF4444');
  const [statusBlue, setStatusBlue] = useState('#3B82F6');

  useEffect(() => {
    if (settings) {
      setPrimaryColor(settings.primaryColor || '#FA634E');
      setAppName(settings.appName || 'MERCON Logistics');
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
      toast.success('Branding & System Theme updated');
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
    toast.info(`Applied ${preset.name} color preset`);
  };

  return (
    <DashboardLayout active="Account" title="Colors & Branding">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-6 max-w-[1350px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl text-[#FA634E]">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Colors & Theme System
                </h1>
                <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-bold text-[10px]">
                  SuperAdmin Only
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize platform primary accent colors, logo, and semantic status tag themes
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-[#FA634E] hover:bg-[#FA634E]/90 text-white font-bold text-xs h-9 px-4 rounded-xl gap-2 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Saving Theme...' : 'Save Theme'}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Color Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">

            {/* Presets */}
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" /> Presets & Primary Brand Accent
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRESET_PALETTES.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        primaryColor === preset.primary
                          ? 'border-[#FA634E] bg-orange-50/50 dark:bg-orange-950/20 ring-1 ring-[#FA634E]'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {preset.name}
                        </span>
                      </div>
                      {primaryColor === preset.primary && <Check className="w-4 h-4 text-[#FA634E]" />}
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Custom Hex Code</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-8.5 font-mono text-xs font-bold uppercase max-w-[140px]"
                      />
                    </div>
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Portal Header Title</Label>
                    <Input
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      className="h-8.5 text-xs font-bold"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Semantic Status Colors */}
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Semantic & Status Tag Mappings
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Universal operational badge colors across trips, drivers, and rate cards
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-2 gap-4">
                
                {/* Active Green */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Active / Completed (Green)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={statusGreen}
                      onChange={(e) => setStatusGreen(e.target.value)}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                    />
                    <Input value={statusGreen} onChange={(e) => setStatusGreen(e.target.value)} className="h-8 text-xs font-mono uppercase" />
                  </div>
                </div>

                {/* Warning Amber */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Warning / Delayed (Amber)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={statusAmber}
                      onChange={(e) => setStatusAmber(e.target.value)}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                    />
                    <Input value={statusAmber} onChange={(e) => setStatusAmber(e.target.value)} className="h-8 text-xs font-mono uppercase" />
                  </div>
                </div>

                {/* Critical Red */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Critical / Failed (Red)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={statusRed}
                      onChange={(e) => setStatusRed(e.target.value)}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                    />
                    <Input value={statusRed} onChange={(e) => setStatusRed(e.target.value)} className="h-8 text-xs font-mono uppercase" />
                  </div>
                </div>

                {/* Info Blue */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Informational (Blue)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={statusBlue}
                      onChange={(e) => setStatusBlue(e.target.value)}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                    />
                    <Input value={statusBlue} onChange={(e) => setStatusBlue(e.target.value)} className="h-8 text-xs font-mono uppercase" />
                  </div>
                </div>

              </CardContent>
            </Card>

          </div>

          {/* Right Column: Live UI Theme Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" /> Live Theme Preview
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  How components will look for operators & admins
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-5">
                
                {/* Header Preview */}
                <div className="p-3 bg-charcoal text-white rounded-xl flex items-center justify-between shadow-xs">
                  <span className="text-xs font-extrabold flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                    {appName || 'MERCON Logistics'}
                  </span>
                  <Badge style={{ backgroundColor: primaryColor, color: '#FFFFFF' }} className="font-bold text-[10px]">
                    Primary Action
                  </Badge>
                </div>

                {/* Buttons Preview */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Buttons</Label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      style={{ backgroundColor: primaryColor }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs"
                    >
                      + New Operational Trip
                    </button>
                    <button
                      type="button"
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50"
                    >
                      Export Ledger
                    </button>
                  </div>
                </div>

                {/* Status Badges Preview */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">Status Badges</Label>
                  <div className="flex flex-wrap gap-2">
                    <span style={{ backgroundColor: `${statusGreen}15`, color: statusGreen, borderColor: `${statusGreen}40` }} className="px-2.5 py-0.5 rounded text-xs font-bold border">
                      Active / Valid
                    </span>
                    <span style={{ backgroundColor: `${statusAmber}15`, color: statusAmber, borderColor: `${statusAmber}40` }} className="px-2.5 py-0.5 rounded text-xs font-bold border">
                      Delayed / Warning
                    </span>
                    <span style={{ backgroundColor: `${statusRed}15`, color: statusRed, borderColor: `${statusRed}40` }} className="px-2.5 py-0.5 rounded text-xs font-bold border">
                      Expired / Failed
                    </span>
                    <span style={{ backgroundColor: `${statusBlue}15`, color: statusBlue, borderColor: `${statusBlue}40` }} className="px-2.5 py-0.5 rounded text-xs font-bold border">
                      Scheduled / Info
                    </span>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
