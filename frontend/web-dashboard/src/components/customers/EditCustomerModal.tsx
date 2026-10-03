import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, User, Phone, FileText, CreditCard, Loader2 } from 'lucide-react';
import { customerService, Customer } from '@/services/customerService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { Checkbox } from '@/components/ui/checkbox';
import CustomerImageUploader from '@/components/ui/CustomerImageUploader';

interface EditCustomerModalProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSuccess?: (updated: Customer) => void;
}

export default function EditCustomerModal({ isOpen, customer, onClose, onSuccess }: EditCustomerModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [primaryContactPerson, setPrimaryContactPerson] = useState('');
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [driverWorkflow, setDriverWorkflow] = useState<'NATIVE' | 'EXTERNAL_APP'>('NATIVE');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setLogoUrl(customer.logo_url || null);
      setContactPhone(customer.contact_phone || customer.primary_contact_phone || customer.phone || '');
      setPrimaryContactPerson(customer.primary_contact_person || '');
      setWhatsappGroupLink(customer.whatsapp_group_link || '');
      setPaymentTerms(customer.payment_terms || 'Net 30 Days');
      setDriverWorkflow(customer.driver_workflow || 'NATIVE');
      setIsActive(customer.isActive ?? true);
      setError(null);
    }
  }, [customer]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => {
      if (!customer) throw new Error('Customer missing');
      return customerService.update(customer.id, payload);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', customer?.id] });
      onSuccess?.(updated);
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to update customer profile');
    },
  });

  if (!customer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!contactPhone.trim()) {
      setError('Contact phone is required');
      return;
    }

    setError(null);
    updateMutation.mutate({
      name: name.trim(),
      contact_phone: contactPhone.trim(),
      logo_url: logoUrl || undefined,
      primary_contact_person: primaryContactPerson.trim() || undefined,
      whatsapp_group_link: whatsappGroupLink.trim() || undefined,
      payment_terms: paymentTerms || undefined,
      driver_workflow: driverWorkflow,
      isActive,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Building2 className="w-5 h-5 text-brand" />
            Edit Customer / Company Profile
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900">
              {error}
            </div>
          )}

          <CustomerImageUploader
            value={logoUrl}
            onChange={(val) => setLogoUrl(val)}
            companyName={name}
          />

          <div className="space-y-1.5">
            <Label htmlFor="edit_customer_name" className="text-xs font-bold flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              Company / Customer Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="edit_customer_name"
              placeholder="e.g. Saudi Aramco Logistics Division"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-xs"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_contact_person" className="text-xs font-semibold flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" /> Primary Contact Person
              </Label>
              <Input
                id="edit_contact_person"
                placeholder="e.g. Faisal Al-Otaibi"
                value={primaryContactPerson}
                onChange={(e) => setPrimaryContactPerson(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_contact_phone" className="text-xs font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" /> Contact Phone
              </Label>
              <PhoneInput
                id="edit_contact_phone"
                value={contactPhone}
                onChange={(val) => setContactPhone(val)}
                placeholder="50 123 4567"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_driver_workflow" className="text-xs font-bold flex items-center gap-1.5">
              Drivers report trips with
            </Label>
            <select
              id="edit_driver_workflow"
              value={driverWorkflow}
              onChange={(e) => setDriverWorkflow(e.target.value as 'NATIVE' | 'EXTERNAL_APP')}
              className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="NATIVE">MERCON Driver app</option>
              <option value="EXTERNAL_APP">Customer's own app (drivers send screenshots)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_whatsapp_link" className="text-xs font-semibold flex items-center gap-1.5">
              <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 dark:fill-emerald-400" />
              WhatsApp Group Link
            </Label>
            <Input
              id="edit_whatsapp_link"
              placeholder="https://chat.whatsapp.com/..."
              value={whatsappGroupLink}
              onChange={(e) => setWhatsappGroupLink(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="edit_customer_active"
              checked={isActive}
              onCheckedChange={(c) => setIsActive(!!c)}
            />
            <Label htmlFor="edit_customer_active" className="text-xs font-semibold cursor-pointer">
              Active Customer Account
            </Label>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} size="sm" className="h-9 text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              size="sm"
              className="h-9 text-xs bg-brand hover:bg-brand/90 text-white font-bold"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
