/** Outbound share links (WhatsApp, email) — built in one place so every screen encodes them the same way. */

export function whatsAppLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(subject: string, body: string, to = ''): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Print one element in its own window with the app's stylesheets, so a statement or voucher prints on its own
 * without hiding the rest of the page through global print CSS.
 */
export function printElement(element: HTMLElement, title: string) {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join('\n');
  win.document.write(
    `<!doctype html><html><head><title>${title.replace(/</g, '&lt;')}</title>${styles}
     <style>@page{size:A4;margin:14mm}body{background:#fff;padding:0;margin:0}</style></head>
     <body>${element.outerHTML}</body></html>`,
  );
  win.document.close();
  win.focus();
  // Let stylesheets load before printing; whichever fires first prints, once.
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    win.print();
  };
  win.onload = doPrint;
  setTimeout(doPrint, 800);
}
