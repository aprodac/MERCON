import React from 'react';
import { Driver } from '@/services/driverService';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface DriverWhatsAppModalProps {
  driver: Driver | null;
  isOpen: boolean;
  onClose: () => void;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  customPhone: string;
  onCustomPhoneChange: (phone: string) => void;
  onSend: () => void;
}

export function DriverWhatsAppModal({
  driver,
  isOpen,
  onClose,
  messageText,
  onMessageTextChange,
  customPhone,
  onCustomPhoneChange,
  onSend,
}: DriverWhatsAppModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <WhatsAppIcon className="h-4 w-4 text-emerald-600" />
            Share to WhatsApp
          </DialogTitle>
          <DialogDescription className="text-xs">
            Send{' '}
            <span className="font-bold text-brand">
              {driver?.first_name} {driver?.last_name}
            </span>
            's profile directly via WhatsApp web or mobile app.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Recipient Phone Number (Optional)
            </label>
            <Input
              placeholder="e.g. 966512345678 (Leave blank to select chat inside WhatsApp)"
              value={customPhone}
              onChange={(e) => onCustomPhoneChange(e.target.value)}
              className="h-9 text-xs border-slate-200 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Message Preview:
            </label>
            <textarea
              value={messageText}
              onChange={(e) => onMessageTextChange(e.target.value)}
              className="w-full h-36 p-3 rounded-xl border border-slate-200 text-xs font-medium font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            onClick={onSend}
          >
            <WhatsAppIcon className="w-3.5 h-3.5 text-white" />
            Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
