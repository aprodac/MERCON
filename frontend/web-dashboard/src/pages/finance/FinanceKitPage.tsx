import React, { useState } from 'react';
import { Download, Plus, FileText, Filter, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Btn from '@/components/ui/Btn';
import {
  FinancePageHeader,
  MoneyText,
  StatusPill,
  SummaryStrip,
  StatusTabs,
  FilterBar,
  FilterChip,
  FinanceEmptyState,
} from '@/components/finance/kit';

export default function FinanceKitPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showSelection, setShowSelection] = useState(false);

  const sampleBarSegments = [
    { value: 650000, color: 'bg-emerald-600', label: 'Collected (65%)' },
    { value: 250000, color: 'bg-amber-500', label: 'Current due (25%)' },
    { value: 100000, color: 'bg-rose-600', label: 'Overdue (10%)' },
  ];

  return (
    <DashboardLayout active="finance" title="Finance Kit Showcase" hideHeader>
      <div className="px-6 pt-5 pb-6 max-w-[1600px] mx-auto space-y-6 animate-fade-in">
        {/* Header Showcase */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
            1. FinancePageHeader
          </h2>
          <FinancePageHeader
            crumbs={[
              { label: 'Finance', to: '/finance/invoices' },
              { label: 'Sales', to: '/finance/invoices' },
              { label: 'Invoices' },
            ]}
            title="Invoices & Customer Billings"
            subtitle="Bill customers for completed trips, track outstanding receivables, and process payments."
            actions={
              <>
                <Btn label="Export" icon={<Download className="w-4 h-4" />} variant="secondary" />
                <Btn label="New Invoice" icon={<Plus className="w-4 h-4" />} variant="primary" shortcut={{ key: 'n' }} />
              </>
            }
          />
        </section>

        {/* MoneyText Showcase */}
        <section className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            2. MoneyText
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 items-baseline">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Hero (default)</p>
              <MoneyText value={1265000.5} currency="SAR" size="hero" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Large (positive)</p>
              <MoneyText value={45200.00} currency="SAR" size="lg" tone="positive" signed />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Medium (negative)</p>
              <MoneyText value={-12400.75} currency="SAR" size="md" tone="negative" signed />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Small (muted)</p>
              <MoneyText value={0} currency="SAR" size="sm" tone="muted" />
            </div>
          </div>
        </section>

        {/* StatusPill Showcase */}
        <section className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            3. StatusPill (All Kinds & Statuses)
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill kind="invoice" status="Draft" />
            <StatusPill kind="invoice" status="Issued" />
            <StatusPill kind="invoice" status="PartiallyPaid" />
            <StatusPill kind="invoice" status="Paid" />
            <StatusPill kind="invoice" status="Void" />
            <StatusPill kind="invoice" status="Overdue" />
            <StatusPill kind="bill" status="Approved" />
            <StatusPill kind="journal" status="Posted" />
            <StatusPill kind="period" status="Open" />
            <StatusPill kind="advance" status="PartiallyApplied" />
            <StatusPill kind="reconciliation" status="Completed" />
          </div>
        </section>

        {/* SummaryStrip Showcase */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            4. SummaryStrip
          </h2>
          <SummaryStrip
            items={[
              {
                label: 'Total Outstanding',
                value: 1000000,
                currency: 'SAR',
                flex: '1.5',
                sub: 'Across 142 open customer invoices',
                bar: { segments: sampleBarSegments },
              },
              {
                label: 'Current (0–30 Days)',
                value: 650000,
                currency: 'SAR',
                tone: 'positive',
                sub: '65% of total outstanding',
              },
              {
                label: 'Overdue (>30 Days)',
                value: 350000,
                currency: 'SAR',
                tone: 'negative',
                sub: '35% requires collection follow-up',
              },
              {
                label: 'Collected This Month',
                value: 1450000,
                currency: 'SAR',
                tone: 'default',
                sub: '+12.4% vs previous month',
              },
            ]}
          />
        </section>

        {/* StatusTabs Showcase */}
        <section className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            5. StatusTabs
          </h2>
          <StatusTabs
            tabs={[
              { key: 'all', label: 'All Invoices', count: 142 },
              { key: 'draft', label: 'Draft', count: 8 },
              { key: 'unpaid', label: 'Unpaid', count: 45 },
              { key: 'overdue', label: 'Overdue', count: 12 },
              { key: 'paid', label: 'Paid', count: 72 },
              { key: 'void', label: 'Void', count: 5 },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </section>

        {/* FilterBar Showcase */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              6. FilterBar & SelectionBar
            </h2>
            <button
              type="button"
              onClick={() => setShowSelection(!showSelection)}
              className="text-xs font-medium text-foreground underline cursor-pointer"
            >
              Toggle SelectionBar mode
            </button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden shadow-xs bg-card">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search invoices by number or customer..."
              chips={
                <>
                  <FilterChip label="Customer" value="Aramco" onClear={() => {}} />
                  <FilterChip label="Date Range" value="Sep 2026" onClear={() => {}} />
                </>
              }
              onAddFilter={() => {}}
              rightSlot={
                <Btn label="Sort: Newest" icon={<Filter className="w-3.5 h-3.5" />} variant="ghost" size="sm" />
              }
              selectionBar={
                showSelection ? (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-medium text-foreground">
                        3 Invoices Selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Btn label="Print Selected" variant="secondary" size="sm" />
                      <Btn label="Export Selected" variant="secondary" size="sm" />
                      <button
                        type="button"
                        onClick={() => setShowSelection(false)}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground ml-2 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </>
                ) : undefined
              }
            />
          </div>
        </section>

        {/* FinanceEmptyState Showcase */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            7. FinanceEmptyState
          </h2>
          <FinanceEmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No Invoices Found"
            description="There are no customer invoices matching your current filters. Try changing your search query or create a new invoice."
            action={
              <Btn label="Create New Invoice" icon={<Plus className="w-4 h-4" />} variant="primary" />
            }
          />
        </section>
      </div>
    </DashboardLayout>
  );
}

