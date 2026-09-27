import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Layers, Plus, Save, Truck, FileText, DollarSign
} from 'lucide-react';

import { Link } from 'react-router-dom';
import { SettingsPage } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { settingsService } from '@/services/settingsService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function TaxonomySettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const [vehicleClasses, setVehicleClasses] = useState<string[]>([
    '3-4 TON', '5 TON', '10 TON', '20 TON', '40 FEET'
  ]);
  const [lineTypes, setLineTypes] = useState<string[]>([
    'Single Trip', 'Round Trip', '10 Hours Duty', '12 Hours Duty'
  ]);
  const [billingTypes, setBillingTypes] = useState<string[]>([
    'Monthly', 'Extra'
  ]);

  const [newVehicle, setNewVehicle] = useState('');
  const [newLine, setNewLine] = useState('');
  const [newBilling, setNewBilling] = useState('');

  useEffect(() => {
    if ((settings as any)?.taxonomyConfig) {
      const cfg = (settings as any).taxonomyConfig as any;
      if (Array.isArray(cfg.vehicleClasses) && cfg.vehicleClasses.length) setVehicleClasses(cfg.vehicleClasses);
      if (Array.isArray(cfg.lineTypes) && cfg.lineTypes.length) setLineTypes(cfg.lineTypes);
      if (Array.isArray(cfg.billingTypes) && cfg.billingTypes.length) setBillingTypes(cfg.billingTypes);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (newTaxonomy: any) => settingsService.update({ taxonomyConfig: newTaxonomy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Taxonomy & Master Data registers updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update taxonomy registers');
    },
  });

  const handleSaveAll = () => {
    updateMutation.mutate({
      vehicleClasses,
      lineTypes,
      billingTypes,
    });
  };

  const addVehicle = () => {
    if (!newVehicle.trim()) return;
    if (vehicleClasses.includes(newVehicle.trim().toUpperCase())) {
      toast.error('Vehicle class already exists');
      return;
    }
    setVehicleClasses([...vehicleClasses, newVehicle.trim().toUpperCase()]);
    setNewVehicle('');
  };

  const removeVehicle = (item: string) => {
    setVehicleClasses(vehicleClasses.filter((v) => v !== item));
  };

  const addLineType = () => {
    if (!newLine.trim()) return;
    if (lineTypes.includes(newLine.trim())) {
      toast.error('Line type already exists');
      return;
    }
    setLineTypes([...lineTypes, newLine.trim()]);
    setNewLine('');
  };

  const removeLineType = (item: string) => {
    setLineTypes(lineTypes.filter((l) => l !== item));
  };

  const addBillingType = () => {
    if (!newBilling.trim()) return;
    if (billingTypes.includes(newBilling.trim())) {
      toast.error('Billing type already exists');
      return;
    }
    setBillingTypes([...billingTypes, newBilling.trim()]);
    setNewBilling('');
  };

  const removeBillingType = (item: string) => {
    setBillingTypes(billingTypes.filter((b) => b !== item));
  };

  return (
    <SettingsPage
      wide
      title="Taxonomy defaults"
      description="Starting lists of vehicle classes, line types and billing types for a new deployment."
      actions={<Btn label="Save" isLoading={updateMutation.isPending} onClick={handleSaveAll} />}
    >
      <div className="rounded-xl border border-[#D97706]/20 bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">
        <p className="font-bold">These lists aren’t used by the app yet</p>
        <p className="mt-0.5">
          Trips, quotations and rate cards read their options from the{' '}
          <Link to="/taxonomy" className="font-bold underline">Taxonomy</Link> page. Edit options there.
        </p>
      </div>
      <div className="flex flex-col gap-6">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Vehicle Tonnage Classes */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-purple-600 shrink-0" />
                <div>
                  <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    Vehicle Classes
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Default fleet capacity tiers
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={newVehicle}
                  onChange={(e) => setNewVehicle(e.target.value)}
                  placeholder="e.g. 15 TON"
                  className="h-8.5 text-xs font-semibold uppercase"
                  onKeyDown={(e) => e.key === 'Enter' && addVehicle()}
                />
                <Button onClick={addVehicle} variant="outline" className="h-8.5 text-xs font-bold shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {vehicleClasses.map((item) => (
                  <Badge key={item} variant="secondary" className="px-3 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    {item}
                    <button onClick={() => removeVehicle(item)} className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Line Types */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    Route Line Types
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Commercial line item classifications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={newLine}
                  onChange={(e) => setNewLine(e.target.value)}
                  placeholder="e.g. Dedicated Standby"
                  className="h-8.5 text-xs font-semibold"
                  onKeyDown={(e) => e.key === 'Enter' && addLineType()}
                />
                <Button onClick={addLineType} variant="outline" className="h-8.5 text-xs font-bold shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {lineTypes.map((item) => (
                  <Badge key={item} variant="secondary" className="px-3 py-1 text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                    {item}
                    <button onClick={() => removeLineType(item)} className="text-blue-400 hover:text-rose-500 transition-colors cursor-pointer">
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Billing Types */}
          <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs">
            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    Billing Classifications
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Standard quotation & invoice billing rules
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={newBilling}
                  onChange={(e) => setNewBilling(e.target.value)}
                  placeholder="e.g. Per Trip / Volume"
                  className="h-8.5 text-xs font-semibold"
                  onKeyDown={(e) => e.key === 'Enter' && addBillingType()}
                />
                <Button onClick={addBillingType} variant="outline" className="h-8.5 text-xs font-bold shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {billingTypes.map((item) => (
                  <Badge key={item} variant="secondary" className="px-3 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                    {item}
                    <button onClick={() => removeBillingType(item)} className="text-emerald-400 hover:text-rose-500 transition-colors cursor-pointer">
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </SettingsPage>
  );
}
