import { toast } from 'sonner';
import { timeAgo } from '@/lib/fleetLive';

/** Copy a link, with a toast either way. */
export async function copyText(text: string, done = 'Link copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy — open the link and copy it from the address bar");
  }
}

/** "Opened 3× · 35m ago" / "Not opened yet" for a tracking link. */
export function opensLabel(count: number, last: string | null | undefined) {
  return count > 0 ? `Opened ${count}× · ${timeAgo(last)}` : 'Not opened yet';
}
