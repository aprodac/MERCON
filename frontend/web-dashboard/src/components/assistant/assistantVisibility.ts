import { useEffect, useState } from 'react';

/**
 * Whether the extra-charges assistant is hidden — per browser, toggled from
 * the top bar, the card's hide button, or Important Reminders. Key and event
 * names are kept from the first assistant so existing choices survive.
 */
const HIDDEN_KEY = 'mercon_assistant_docked_v1';
const EVENT = 'mercon_assistant_dock_change';

export function isAssistantHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAssistantHidden(hidden: boolean) {
  try {
    localStorage.setItem(HIDDEN_KEY, String(hidden));
  } catch {
    /* storage blocked — the choice lasts until reload */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { hidden } }));
}

export function useAssistantHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(isAssistantHidden);
  useEffect(() => {
    const on = (e: Event) => setHidden((e as CustomEvent).detail?.hidden ?? isAssistantHidden());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [hidden, setAssistantHidden];
}
