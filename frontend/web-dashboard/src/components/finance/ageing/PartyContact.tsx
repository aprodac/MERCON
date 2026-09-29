import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Phone } from 'lucide-react';
import type { AgeingRow } from '@/services/financeService';
import { formatMoney } from '@/lib/finance/format';
import { overdueAmountOf } from '@/lib/finance/ageing';

/** Hover-card body for a party row: contact details, balance split and links out. */
export function PartyContact({ row, prior, links }: { row: AgeingRow; /** Balance 30 days earlier. */ prior?: number; links: { label: string; to: string }[] }) {
  const overdue = overdueAmountOf(row);
  const delta = prior === undefined ? null : row.total - prior;
  return (
    <div className="space-y-2.5">
      <p className="font-semibold text-foreground">{row.party_name}</p>
      {(row.party?.phone || row.party?.email) && (
        <div className="space-y-1 text-muted-foreground">
          {row.party?.phone && <p className="flex items-center gap-2"><Phone className="size-3.5" /> {row.party.phone}</p>}
          {row.party?.email && <p className="flex items-center gap-2"><Mail className="size-3.5" /> {row.party.email}</p>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Open</p>
          <p className="fin-num font-semibold">{formatMoney(row.total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Overdue</p>
          <p className="fin-num font-semibold">{formatMoney(overdue)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">vs 30 days</p>
          <p className="fin-num font-semibold">{delta === null || delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))}`}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t pt-2">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-1 font-medium text-foreground hover:underline">
            {l.label} <ArrowRight className="size-3" />
          </Link>
        ))}
      </div>
    </div>
  );
}
