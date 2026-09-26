/**
 * App-wide in-app message (replaces informational Alert.alert pop-ups).
 * Call `showToast('Saved')` from anywhere; <AppToastHost /> in the root layout
 * renders it with the shared <Toast> look. Pop-ups that ask the driver to
 * choose (Yes / Cancel) stay as Alert.alert.
 */
import { useEffect, useState } from 'react';
import { Toast } from '@mercon/mobile-shared/components/Toast';

type ToastType = 'success' | 'info' | 'error';
interface ToastMessage { id: number; message: string; type: ToastType }

let listener: ((t: ToastMessage) => void) | null = null;
let nextId = 1;

export function showToast(message: string, type: ToastType = 'success') {
  listener?.({ id: nextId++, message, type });
}

export function AppToastHost() {
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  useEffect(() => {
    listener = setCurrent;
    return () => {
      if (listener === setCurrent) listener = null;
    };
  }, []);

  return (
    <Toast
      key={current?.id}
      visible={!!current}
      message={current?.message ?? ''}
      type={current?.type}
      duration={current?.type === 'error' ? 4500 : 3000}
      onDismiss={() => setCurrent(null)}
    />
  );
}
