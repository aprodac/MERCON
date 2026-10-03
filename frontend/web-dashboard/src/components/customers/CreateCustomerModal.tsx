import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, User, Phone, Loader2 } from 'lucide-react';
import { customerService, Customer } from '@/services/customerService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';

interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer: Customer) => void;
}

export default function CreateCustomerModal({ isOpen, onClose, onSuccess }: CreateCustomerModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [primaryContactPerson, setPrimaryContactPerson] = useState('');
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');
  const [driverWorkflow, setDriverWorkflow] = useState<'NATIVE' | 'EXTERNAL_APP'>('NATIVE');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: customerService.create,
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      resetForm();
      if (customer) {
        onSuccess?.(customer);
      }
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to create customer profile');
    },
  });

  const resetForm = () => {
    setName('');
    setContactPhone('');
    setPrimaryContactPerson('');
    setWhatsappGroupLink('');
    setDriverWorkflow('NATIVE');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Company / Customer name is required');
      return;
    }
    // The customer record needs a phone (drivers and the office call it); it
    // used to be saved as the text "N/A", which showed dead call buttons.
    if (contactPhone.replace(/\D/g, '').length < 6) {
      setError('Contact phone is required');
      return;
    }
    setError(null);

    createMutation.mutate({
      name: name.trim(),
      contact_phone: contactPhone.trim(),
      primary_contact_person: primaryContactPerson.trim() || undefined,
      whatsapp_group_link: whatsappGroupLink.trim() || undefined,
      driver_workflow: driverWorkflow,
    } as any);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Building2 className="w-5 h-5 text-brand" />
            Add New Client Company / Customer Profile
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-bold flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              Customer Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Saudi Aramco Logistics Division"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-xs"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact_person" className="text-xs font-semibold flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" /> Primary Contact Person
              </Label>
              <Input
                id="contact_person"
                placeholder="e.g. Faisal Al-Otaibi"
                value={primaryContactPerson}
                onChange={(e) => setPrimaryContactPerson(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact_phone" className="text-xs font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" /> Contact Phone
              </Label>
              <PhoneInput
                id="contact_phone"
                value={contactPhone}
                onChange={(val) => setContactPhone(val)}
                placeholder="50 123 4567"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="driver_workflow" className="text-xs font-bold flex items-center gap-1.5">
              Driver Workflow Configuration
            </Label>
            <select
              id="driver_workflow"
              value={driverWorkflow}
              onChange={(e) => setDriverWorkflow(e.target.value as 'NATIVE' | 'EXTERNAL_APP')}
              className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="NATIVE">Native CargoPod App (Standard Driver Stepper)</option>
              <option value="EXTERNAL_APP">External Customer App (Screenshot AI Ingestion)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp_link" className="text-xs font-semibold flex items-center gap-1.5">
              <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 dark:fill-emerald-400" />
              WhatsApp Dispatch Group Link (Optional)
            </Label>
            <Input
              id="whatsapp_link"
              placeholder="https://chat.whatsapp.com/..."
              value={whatsappGroupLink}
              onChange={(e) => setWhatsappGroupLink(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} size="sm" className="h-9 text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              size="sm"
              className="h-9 text-xs bg-brand hover:bg-brand/90 text-white font-bold"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                'Save Customer Profile'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
