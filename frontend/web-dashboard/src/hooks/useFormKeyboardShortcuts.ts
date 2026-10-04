import { useEffect, useRef } from 'react';

interface FormKeyboardShortcutsOptions {
  onSave?: () => void;
  onCancel?: () => void;
  onNewRow?: () => void;
  isEnabled?: boolean;
  isSubmitting?: boolean;
  enterToNextField?: boolean;
}

/**
 * Custom React hook for standard ERP keyboard shortcuts in form views & modals.
 *
 * Supported Shortcuts:
 * - Ctrl + S / Cmd + S: Save / Submit Form
 * - Esc: Cancel / Close Modal / Go Back
 * - Alt + N: Add New Row / Line Item (if applicable)
 * - Enter: Focus next form field (ERP style) instead of premature form save
 */
export function useFormKeyboardShortcuts({
  onSave,
  onCancel,
  onNewRow,
  isEnabled = true,
  isSubmitting = false,
  enterToNextField = true, // Default to ERP field-stepping mode
}: FormKeyboardShortcutsOptions) {
  const lastEnterTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // 1. Ctrl+S or Cmd+S -> Save Form (Explicit Save Action)
      if (isCmdOrCtrl && key === 's') {
        event.preventDefault();
        event.stopPropagation();
        if (onSave && !isSubmitting) {
          onSave();
        }
        return;
      }

      // 2. Esc -> Cancel / Close
      if (key === 'escape') {
        // Esc belongs to whatever is open on top of the form (a dropdown, menu,
        // date picker or dialog) — closing a dropdown used to cancel the whole
        // page and throw the form away.
        const overlayOpen =
          event.defaultPrevented ||
          target.getAttribute('aria-expanded') === 'true' ||
          !!document.querySelector('[data-radix-popper-content-wrapper], [role="listbox"], [role="menu"], [role="dialog"], [role="alertdialog"]');
        if (overlayOpen) return;
        if (onCancel) {
          event.stopPropagation();
          onCancel();
        }
        return;
      }

      // 3. Alt+N -> Add New Row
      if (event.altKey && key === 'n') {
        event.preventDefault();
        if (onNewRow) {
          onNewRow();
        }
        return;
      }

      // 4. Enter Key -> ERP Next-Field Focus Stepping & Double-Enter Step Advancing
      // Skip if the input is inside an open dropdown/combobox (Radix popover with data-state="open")
      // so the dropdown can handle Enter to select its highlighted item.
      const isInsideOpenPopover = !!target.closest('[data-radix-popper-content-wrapper]');

      if (enterToNextField && key === 'enter' && isInput && !isInsideOpenPopover) {
        // Allow Enter inside multiline textareas or explicit submit buttons
        if (target.tagName === 'TEXTAREA' || (target as HTMLInputElement).type === 'submit') {
          return;
        }

        const now = Date.now();
        const isDoubleEnter = now - lastEnterTimeRef.current <= 450;
        lastEnterTimeRef.current = now;

        // Double-Enter -> Trigger onSave() (Advance to next step/tab) immediately
        if (isDoubleEnter) {
          event.preventDefault();
          event.stopPropagation();
          lastEnterTimeRef.current = 0;
          if (onSave && !isSubmitting) {
            onSave();
          }
          return;
        }

        // Single-Enter -> Focus nearest form container's next input
        const container =
          target.closest('form') ||
          target.closest('[role="dialog"]') ||
          target.closest('.animate-fade-in') ||
          document.body;

        if (container) {
          const focusableInputs = Array.from(
            container.querySelectorAll<HTMLElement>(
              'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), button[type="submit"]:not([tabindex="-1"])'
            )
          ).filter((el) => {
            const style = window.getComputedStyle(el);
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              (el.offsetWidth > 0 || el.offsetHeight > 0) &&
              el.getAttribute('tabindex') !== '-1'
            );
          });

          const currentIndex = focusableInputs.indexOf(target);

          if (currentIndex > -1) {
            event.preventDefault();
            event.stopPropagation();

            if (currentIndex < focusableInputs.length - 1) {
              const nextEl = focusableInputs[currentIndex + 1];
              nextEl.focus();

              // If next element is a text/number/time input, select its text for fast overwriting
              if (
                nextEl instanceof HTMLInputElement &&
                (nextEl.type === 'text' || nextEl.type === 'number' || nextEl.type === 'time' || nextEl.type === 'date')
              ) {
                setTimeout(() => {
                  try {
                    nextEl.select();
                  } catch (e) {
                    // Ignore non-selectable input types
                  }
                }, 10);
              }
            } else {
              // Reached last input field -> Focus primary submit button or trigger save
              if (onSave && !isSubmitting) {
                onSave();
              }
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onSave, onCancel, onNewRow, isEnabled, isSubmitting, enterToNextField]);
}
