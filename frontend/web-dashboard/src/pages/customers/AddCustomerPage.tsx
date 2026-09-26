import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  RotateCcw, 
  Plus, 
  Building2, 
  Trash2, 
  Star, 
  Users,
  UploadCloud,
  FileText,
  X,
  CheckCircle2
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { customerService, CreateCustomerPayload } from '@/services/customerService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import PhoneInput from '@/components/ui/PhoneInput';
import CustomerImageUploader from '@/components/ui/CustomerImageUploader';
import { useFormKeyboardShortcuts } from '@/hooks/useFormKeyboardShortcuts';
import { KbdBadge } from '@/components/ui/KbdBadge';

export interface ContactPerson {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  is_primary: boolean;
}

export interface CustomerDocumentFile {
  id: string;
  name: string;
  size: string;
  type: string;
}

export default function AddCustomerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    logo_url: null as string | null,
    contact_phone: '',
    whatsapp_number: '',
    whatsapp_group_link: '',
    whatsapp_group_name: '',
    payment_terms: 'Net 30 Days',
    isActive: true,
  });

  // Dynamic Contact Personnel List (Max 2: Primary & Secondary)
  const [contacts, setContacts] = useState<ContactPerson[]>([
    {
      id: '1',
      name: '',
      title: 'Primary Contact',
      phone: '',
      email: '',
      is_primary: true,
    },
  ]);

  // Dynamic Customer Document Files
  const [files, setFiles] = useState<CustomerDocumentFile[]>([]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Contact Personnel Actions (Capped at 2)
  const addContactPerson = () => {
    setContacts((prev) => {
      if (prev.length >= 2) return prev;
      const newId = String(Date.now());
      return [
        ...prev,
        {
          id: newId,
          name: '',
          title: 'Secondary Contact',
          phone: '',
          email: '',
          is_primary: false,
        },
      ];
    });
  };

  const removeContactPerson = (id: string) => {
    setContacts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length > 0 && !filtered.some((c) => c.is_primary)) {
        filtered[0].is_primary = true;
      }
      return filtered;
    });
  };

  const updateContactPerson = (id: string, field: keyof ContactPerson, value: any) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return { ...c, [field]: value };
        }
        if (field === 'is_primary' && value === true) {
          return { ...c, is_primary: false };
        }
        return c;
      })
    );
  };

  const setPrimaryContact = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        is_primary: c.id === id,
      }))
    );
  };

  // Document File Upload Actions
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const uploadedFiles = Array.from(e.target.files).map((f, i) => ({
        id: String(Date.now() + i),
        name: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        type: f.type || 'Document',
      }));
      setFiles((prev) => [...prev, ...uploadedFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleReset = () => {
    setFormData({
      name: '',
      logo_url: null,
      contact_phone: '',
      whatsapp_number: '',
      whatsapp_group_link: '',
      whatsapp_group_name: '',
      payment_terms: 'Net 30 Days',
      isActive: true,
    });
    setContacts([
      {
        id: '1',
        name: '',
        title: 'Primary Contact',
        phone: '',
        email: '',
        is_primary: true,
      },
    ]);
    setFiles([]);
    setError(null);
  };

  // Primary Contact details
  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];
  const effectivePhone = formData.contact_phone.trim() || primaryContact?.phone.trim() || '';

  // Mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateCustomerPayload) => customerService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create customer');
    },
  });

  const isFormValid = formData.name.trim() !== '' && (formData.contact_phone.trim() !== '' || primaryContact?.phone.trim() !== '');

  const handleSubmit = useCallback(() => {
    setError(null);

    if (!formData.name.trim()) {
      setError('Company Name is required');
      return;
    }
    if (!effectivePhone) {
      setError('Primary Contact Phone is required');
      return;
    }

    const secondaryContact = contacts.find((c) => !c.is_primary);

    createMutation.mutate({
      name: formData.name.trim(),
      contact_phone: effectivePhone,
      logo_url: formData.logo_url || undefined,
      primary_contact_person: primaryContact?.name?.trim() || undefined,
      primary_contact_phone: primaryContact?.phone?.trim() || effectivePhone,
      secondary_contact_person: secondaryContact?.name?.trim() || undefined,
      secondary_contact_phone: secondaryContact?.phone?.trim() || undefined,
      payment_terms: formData.payment_terms || undefined,
      whatsapp_number: formData.whatsapp_number.trim() || undefined,
      whatsapp_group_link: formData.whatsapp_group_link.trim() || undefined,
      whatsapp_group_name: formData.whatsapp_group_name.trim() || undefined,
      isActive: formData.isActive,
    });
  }, [formData, effectivePhone, primaryContact, contacts, createMutation]);

  // Keyboard Shortcuts Integration
  useFormKeyboardShortcuts({
    onSave: () => {
      if (isFormValid) handleSubmit();
    },
    onCancel: () => navigate('/customers'),
    onNewRow: addContactPerson,
    isSubmitting: createMutation.isPending,
  });

  // Completion Tracking
  const completionFields = [
    { label: 'Company Name', filled: formData.name.trim() !== '' },
    { label: 'Primary Contact Phone', filled: effectivePhone !== '' },
    { label: 'Contact Person', filled: primaryContact?.name.trim() !== '' },
  ];
  const filledCount = completionFields.filter(f => f.filled).length;
  const completionPct = Math.round((filledCount / completionFields.length) * 100);

  return (
    <DashboardLayout active="Customers" title="Add Customer">
      <div className="px-3 sm:px-5 pb-4 space-y-3 animate-fade-in max-w-[1350px] mx-auto">
        
        {/* Slim Top Action Strip */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-100 text-brand dark:bg-orange-950/50 dark:text-orange-400 font-bold border-none text-[11px] px-2 py-0.5">
              <Building2 className="w-3 h-3 mr-1 inline" /> New Customer
            </Badge>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">• Registration</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleReset}
              className="h-7 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 px-2"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/customers')}
              className="h-7 text-xs font-medium border-slate-200 dark:border-slate-800 px-2.5"
            >
              Cancel <KbdBadge keys="Esc" />
            </Button>
            <Button 
              size="sm" 
              onClick={handleSubmit}
              disabled={createMutation.isPending || !isFormValid}
              className="h-7 text-xs bg-brand hover:bg-brand-hover text-white font-bold px-3 shadow-xs"
            >
              {createMutation.isPending ? 'Saving...' : 'Save Customer'} <KbdBadge keys="Ctrl+S" />
            </Button>
          </div>
        </div>

        {/* 2-Column High-Density Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* Main Form Card (8 Columns) */}
          <div className="lg:col-span-8 space-y-3">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-2xs">
              <CardContent className="p-3.5 sm:p-4 space-y-3.5">
                
                {/* 1. Company Profile */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-brand" /> Company Information
                    </h2>
                  </div>

                  {/* Company Logo Uploader */}
                  <CustomerImageUploader
                    value={formData.logo_url}
                    onChange={(val) => handleChange('logo_url', val)}
                    companyName={formData.name}
                    className="mb-2"
                  />

                  {/* Company Name & Payment Terms */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="name" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Company Name <span className="text-rose-500">*</span>
                      </Label>
                      <Input 
                        id="name" 
                        placeholder="e.g. SABIC Logistics Co." 
                        value={formData.name} 
                        onChange={(e) => handleChange('name', e.target.value)} 
                        className="h-8 text-xs" 
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="payment_terms" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Payment Terms
                      </Label>
                      <Select
                        value={formData.payment_terms}
                        onValueChange={(val) => handleChange('payment_terms', val)}
                      >
                        <SelectTrigger id="payment_terms" className="h-8 text-xs">
                          <SelectValue placeholder="Select terms" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Net 15 Days">Net 15 Days</SelectItem>
                          <SelectItem value="Net 30 Days">Net 30 Days</SelectItem>
                          <SelectItem value="Net 45 Days">Net 45 Days</SelectItem>
                          <SelectItem value="Net 60 Days">Net 60 Days</SelectItem>
                          <SelectItem value="Cash / Advance">Cash / Advance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Account Status
                      </Label>
                      <div className="flex items-center gap-1.5 h-8">
                        <button
                          type="button"
                          onClick={() => handleChange('isActive', true)}
                          className={`flex-1 h-8 text-[11px] font-semibold rounded-md border text-center transition-all ${
                            formData.isActive
                              ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          Active
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChange('isActive', false)}
                          className={`flex-1 h-8 text-[11px] font-semibold rounded-md border text-center transition-all ${
                            !formData.isActive
                              ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          Inactive
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp Dispatch Integration Fields */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 dark:fill-emerald-400" /> WhatsApp Dispatch Contacts
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <Label htmlFor="whatsapp_number" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Saved WhatsApp Number
                        </Label>
                        <PhoneInput
                          id="whatsapp_number"
                          placeholder="50 000 0000"
                          value={formData.whatsapp_number}
                          onChange={(val) => handleChange('whatsapp_number', val)}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="whatsapp_group_name" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          WhatsApp Group Name
                        </Label>
                        <Input
                          id="whatsapp_group_name"
                          placeholder="e.g. SABIC Operations Group"
                          value={formData.whatsapp_group_name}
                          onChange={(e) => handleChange('whatsapp_group_name', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="whatsapp_group_link" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          WhatsApp Group Link
                        </Label>
                        <Input
                          id="whatsapp_group_link"
                          placeholder="https://chat.whatsapp.com/..."
                          value={formData.whatsapp_group_link}
                          onChange={(e) => handleChange('whatsapp_group_link', e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Key Contact Personnel (Compact Dynamic List) */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" /> Key Contacts ({contacts.length})
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addContactPerson}
                      className="h-6 text-[11px] font-semibold gap-1 text-brand border-orange-200 hover:bg-orange-50 dark:border-slate-700 px-2"
                    >
                      <Plus className="w-3 h-3" /> Add Contact
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {contacts.map((contact, idx) => (
                      <div
                        key={contact.id}
                        className={`p-2.5 rounded-lg border space-y-2 transition-all ${
                          contact.is_primary
                            ? 'border-orange-200 bg-orange-50/20 dark:bg-orange-950/20 dark:border-orange-900/40'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={contact.is_primary ? 'default' : 'outline'}
                              className={`text-[9px] font-bold cursor-pointer py-0 px-1.5 h-5 ${
                                contact.is_primary
                                  ? 'bg-brand text-white hover:bg-brand-hover'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                              onClick={() => setPrimaryContact(contact.id)}
                            >
                              {contact.is_primary ? (
                                <span className="flex items-center gap-1">
                                  <Star className="w-2.5 h-2.5 fill-current" /> Primary Contact
                                </span>
                              ) : (
                                `Contact #${idx + 1}`
                              )}
                            </Badge>
                            {!contact.is_primary && (
                              <button
                                type="button"
                                onClick={() => setPrimaryContact(contact.id)}
                                className="text-[10px] text-slate-400 hover:text-orange-600 font-semibold underline"
                              >
                                Set primary
                              </button>
                            )}
                          </div>

                          {contacts.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeContactPerson(contact.id)}
                              className="h-5 w-5 p-0 text-slate-400 hover:text-rose-600"
                              title="Remove contact"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="space-y-0.5 sm:col-span-1">
                            <Label className="text-[10px] font-semibold text-slate-500">
                              Full Name {contact.is_primary && <span className="text-rose-500">*</span>}
                            </Label>
                            <Input
                              placeholder="e.g. Eng. Tariq Al-Mansoor"
                              value={contact.name}
                              onChange={(e) => updateContactPerson(contact.id, 'name', e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>

                          <div className="space-y-0.5 sm:col-span-1">
                            <Label className="text-[10px] font-semibold text-slate-500">
                              Phone {contact.is_primary && <span className="text-rose-500">*</span>}
                            </Label>
                            <PhoneInput
                              value={contact.phone}
                              onChange={(val: string) => {
                                updateContactPerson(contact.id, 'phone', val);
                                if (contact.is_primary) {
                                  handleChange('contact_phone', val);
                                }
                              }}
                              placeholder="50 000 0000"
                            />
                          </div>

                          <div className="space-y-0.5 sm:col-span-1">
                            <Label className="text-[10px] font-semibold text-slate-500">Job Title / Role</Label>
                            <Input
                              placeholder="e.g. Logistics Director"
                              value={contact.title}
                              onChange={(e) => updateContactPerson(contact.id, 'title', e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>

                          <div className="space-y-0.5 sm:col-span-1">
                            <Label className="text-[10px] font-semibold text-slate-500">Email Address</Label>
                            <Input
                              type="email"
                              placeholder="tariq@company.com"
                              value={contact.email}
                              onChange={(e) => {
                                updateContactPerson(contact.id, 'email', e.target.value);
                                if (contact.is_primary) {
                                  handleChange('email', e.target.value);
                                }
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Customer Files & Documents */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" /> Customer Documents ({files.length})
                    </h2>
                    <span className="text-[10px] text-slate-400 font-medium">CR Copy, VAT Cert., Agreement</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <label className="sm:col-span-5 border border-dashed border-slate-300 dark:border-slate-700 hover:border-brand dark:hover:border-brand rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/50 block">
                      <input type="file" multiple onChange={handleFileUpload} className="hidden" />
                      <UploadCloud className="w-4 h-4 mx-auto text-slate-400 mb-0.5" />
                      <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Upload Files / Documents
                      </p>
                      <p className="text-[9px] text-slate-400">PDF, PNG, JPG (Max 10MB)</p>
                    </label>

                    <div className="sm:col-span-7 space-y-1 max-h-[100px] overflow-y-auto pr-1">
                      {files.length === 0 ? (
                        <div className="p-2 border border-slate-100 dark:border-slate-800 rounded-md text-[10px] text-slate-400 italic text-center">
                          No customer documents attached yet
                        </div>
                      ) : (
                        files.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-1.5 px-2 bg-slate-100/70 dark:bg-slate-800/60 rounded-md border border-slate-200/60 dark:border-slate-700/60 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
                              <span className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">{file.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono shrink-0">({file.size})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(file.id)}
                              className="text-slate-400 hover:text-rose-500 p-0.5 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {error && (
              <div className="p-2.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-800">
                {error}
              </div>
            )}
          </div>

          {/* Right Sidebar: Compact Summary (4 Columns) */}
          <div className="lg:col-span-4 space-y-3 sticky top-2">
            
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Account Summary</span>
                <Badge variant="outline" className="text-[10px] font-mono text-brand border-orange-200">
                  {completionPct}% Complete
                </Badge>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Building2 className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">Company</span>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {formData.name.trim() || 'New Customer Account'}
                    </p>
                  </div>
                </div>

                {/* Key Personnel Summary */}
                <div className="space-y-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">
                    Primary Contact
                  </span>
                  
                  {primaryContact && (
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="w-5 h-5 text-brand shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-900 dark:text-slate-100 truncate block text-[11px]">
                          {primaryContact.name.trim() || 'Not specified'}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate font-mono">
                          {primaryContact.phone ? `+966 ${primaryContact.phone}` : 'Phone required'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Documents Summary */}
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 font-semibold">Attached Files</span>
                  <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 h-4">
                    {files.length} {files.length === 1 ? 'File' : 'Files'}
                  </Badge>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                  <span>Required fields</span>
                  <span>{filledCount} of {completionFields.length}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-brand h-full transition-all duration-300 rounded-full"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>

              <Button 
                size="sm" 
                onClick={handleSubmit} 
                disabled={createMutation.isPending || !isFormValid}
                className="w-full h-8 text-xs bg-brand hover:bg-brand-hover text-white font-bold shadow-xs mt-1"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Customer Account'}
              </Button>
            </Card>

          </div>

        </div>

      </div>
    </DashboardLayout>
  );
}
