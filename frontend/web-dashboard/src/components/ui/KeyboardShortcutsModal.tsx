import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './dialog';
import { KbdBadge } from './KbdBadge';
import { SHORTCUTS_EVENT } from '@/lib/navigation/navStore';
import { Keyboard, Command, Sparkles, Navigation, Edit3, Table } from 'lucide-react';

export const KeyboardShortcutsModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Trigger on '?' when not typing, or 'Ctrl + /'
      if ((e.key === '?' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    const openGuide = () => setIsOpen(true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(SHORTCUTS_EVENT, openGuide);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(SHORTCUTS_EVENT, openGuide);
    };
  }, []);

  const shortcutGroups = [
    {
      title: 'Form & Record Actions',
      icon: Edit3,
      items: [
        { label: 'Save / Submit Form', shortcut: 'Ctrl + S' },
        { label: 'Cancel / Discard / Close Modal', shortcut: 'Esc' },
        { label: 'Add New Item / Row', shortcut: 'Alt + N' },
        { label: 'Move to Next Input Field', shortcut: 'Tab' },
        { label: 'Move to Previous Input Field', shortcut: 'Shift + Tab' },
      ],
    },
    {
      title: 'Table & Ledger Grids',
      icon: Table,
      items: [
        { label: 'Navigate Grid Cells', shortcut: 'Arrow Keys' },
        { label: 'Edit Focused Cell / Auto-Append Row', shortcut: 'Enter' },
        { label: 'Delete Active Grid Row', shortcut: 'Alt + D' },
      ],
    },
    {
      title: 'Global System Controls',
      icon: Navigation,
      items: [
        { label: 'Command Palette / Search', shortcut: 'Ctrl + K' },
        { label: 'Collapse / Expand Sidebar', shortcut: 'Ctrl + B' },
        { label: 'New Trip', shortcut: 'Alt + T' },
        { label: 'Toggle Keyboard Guide', shortcut: '?' },
        { label: 'Focus Search Bar', shortcut: '/' },
      ],
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xl rounded-xl">
        <DialogHeader className="border-b pb-4 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Keyboard className="w-5 h-5" />
            </div>
            ERP Keyboard Shortcuts Guide
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-slate-400">
            Use these standardized shortcuts to navigate forms, ledgers, and pages at high speed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {shortcutGroups.map((group, idx) => {
            const Icon = group.icon;
            return (
              <div key={idx} className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  <Icon className="w-4 h-4" />
                  {group.title}
                </div>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-100 dark:border-slate-800/80 space-y-2.5">
                  {group.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className="flex items-center justify-between text-xs text-gray-700 dark:text-slate-200"
                    >
                      <span>{item.label}</span>
                      <KbdBadge keys={item.shortcut} className="ml-0" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t dark:border-slate-800 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Press <KbdBadge keys="?" className="mx-1" /> anytime to toggle this menu.
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 font-medium transition"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
