import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import type { ComponentType } from 'react';
import { authStore } from '@/store/authStore';
import FullPageSpinner from '@/components/ui/FullPageSpinner';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import RequireRole from '@/components/auth/RequireRole';
import RequireSuperAdmin from '@/components/auth/RequireSuperAdmin';
import RequireModule from '@/components/auth/RequireModule';
import AppShell from '@/components/layout/AppShell';
import { useApplyBranding } from '@/hooks/useBranding';
import { lazyWithRetry } from '@/utils/lazyWithRetry';

/**
 * WithIdKey — wraps a page component and uses the `:id` URL param as the
 * React `key`. This forces a full unmount + remount whenever the ID changes,
 * completely eliminating stale React-Query cache data race conditions that
 * caused the ErrorBoundary "Something went wrong" crash when navigating
 * between different detail pages (drivers, customers, third-parties, etc.).
 */
function WithIdKey({ Page }: { Page: ComponentType }) {
  const { id } = useParams<{ id: string }>();
  return <Page key={id} />;
}

/* ─── Auth pages (eager — small, always needed) ──────────────────────────── */
import LoginPage         from '@/pages/auth/LoginPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

/* ─── Protected pages (lazy with automatic chunk retry) ──────────────────── */
const DashboardPage           = lazyWithRetry(() => import('@/pages/dashboard/DashboardPage'));
const NotificationsPage       = lazyWithRetry(() => import('@/pages/notifications/NotificationsPage'));

// Trips
const TripListPage            = lazyWithRetry(() => import('@/pages/trips/TripListPage'));
const MonthlyTripsPage        = lazyWithRetry(() => import('@/pages/trips/MonthlyTripsPage'));
const TripDetailsPage         = lazyWithRetry(() => import('@/pages/trips/TripDetailsPage'));
const CreateTripPage          = lazyWithRetry(() => import('@/pages/trips/CreateTripPage'));
const EditTripPage            = lazyWithRetry(() => import('@/pages/trips/EditTripPage'));
const TripTrackingPage        = lazyWithRetry(() => import('@/pages/trips/TripTrackingPage'));
const TripCompletionPage      = lazyWithRetry(() => import('@/pages/trips/TripCompletionPage'));
const TripEvidencePublicGalleryPage = lazyWithRetry(() => import('@/pages/public/TripEvidencePublicGalleryPage'));
const ThirdPartyListPage      = lazyWithRetry(() => import('@/pages/third-party/ThirdPartyListPage'));
const ThirdPartyDetailsPage   = lazyWithRetry(() => import('@/pages/third-party/ThirdPartyDetailsPage'));

// Drivers
const DriverListPage          = lazyWithRetry(() => import('@/pages/drivers/DriverListPage'));
const DriverDetailsPage       = lazyWithRetry(() => import('@/pages/drivers/DriverDetailsPage'));
const AddDriverPage           = lazyWithRetry(() => import('@/pages/drivers/AddDriverPage'));
const EditDriverPage          = lazyWithRetry(() => import('@/pages/drivers/EditDriverPage'));
const DriverDocumentsPage     = lazyWithRetry(() => import('@/pages/drivers/DriverDocumentsPage'));

// Vehicles
const VehicleListPage         = lazyWithRetry(() => import('@/pages/vehicles/VehicleListPage'));
const VehicleDetailsPage      = lazyWithRetry(() => import('@/pages/vehicles/VehicleDetailsPage'));
const AddVehiclePage          = lazyWithRetry(() => import('@/pages/vehicles/AddVehiclePage'));
const EditVehiclePage         = lazyWithRetry(() => import('@/pages/vehicles/EditVehiclePage'));
const VehicleDocumentsPage    = lazyWithRetry(() => import('@/pages/vehicles/VehicleDocumentsPage'));
const VehicleFinancialsPage   = lazyWithRetry(() => import('@/pages/vehicles/VehicleFinancialsPage'));
const VehicleSingleFinancialsPage = lazyWithRetry(() => import('@/pages/vehicles/VehicleSingleFinancialsPage'));
const MaintenanceListPage     = lazyWithRetry(() => import('@/pages/maintenance/MaintenanceListPage'));
const MaintenanceDetailsPage  = lazyWithRetry(() => import('@/pages/maintenance/MaintenanceDetailsPage'));
const AddMaintenancePage      = lazyWithRetry(() => import('@/pages/maintenance/AddMaintenancePage'));
const EditMaintenancePage     = lazyWithRetry(() => import('@/pages/maintenance/EditMaintenancePage'));

// Customers
const CustomerListPage        = lazyWithRetry(() => import('@/pages/customers/CustomerListPage'));
const CustomerDetailsPage     = lazyWithRetry(() => import('@/pages/customers/CustomerDetailsPage'));
const AddCustomerPage         = lazyWithRetry(() => import('@/pages/customers/AddCustomerPage'));
const EditCustomerPage        = lazyWithRetry(() => import('@/pages/customers/EditCustomerPage'));

const LocationListPage        = lazyWithRetry(() => import('@/pages/locations/LocationListPage'));
const AddLocationPage         = lazyWithRetry(() => import('@/pages/locations/AddLocationPage'));
const LocationDetailsPage      = lazyWithRetry(() => import('@/pages/locations/LocationDetailsPage'));
const TaxonomyManagementPage  = lazyWithRetry(() => import('@/pages/taxonomy/TaxonomyManagementPage'));
// Quotations & Commercial Agreements
const QuotationListPage        = lazyWithRetry(() => import('@/pages/quotations/QuotationListPage'));
const AddQuotationPage         = lazyWithRetry(() => import('@/pages/quotations/AddQuotationPage'));
const EditQuotationPage        = lazyWithRetry(() => import('@/pages/quotations/EditQuotationPage'));
const QuotationDocsPage        = lazyWithRetry(() => import('@/pages/quotations/QuotationDocsPage'));
const QuotationAiImportPage    = lazyWithRetry(() => import('@/pages/quotations/QuotationAiImportPage'));



// Expenses
const ExpenseListPage         = lazyWithRetry(() => import('@/pages/expenses/ExpenseListPage'));
const ExpenseDetailsPage      = lazyWithRetry(() => import('@/pages/expenses/ExpenseDetailsPage'));

// Accounting & Finance Foundation
const ChartOfAccountsPage     = lazyWithRetry(() => import('@/pages/finance/ChartOfAccountsPage'));
const AccountingPeriodsPage   = lazyWithRetry(() => import('@/pages/finance/AccountingPeriodsPage'));
const JournalEntriesPage      = lazyWithRetry(() => import('@/pages/finance/JournalEntriesPage'));
const JournalEntryDetailPage  = lazyWithRetry(() => import('@/pages/finance/JournalEntryDetailPage'));
const JournalEntryEditorPage  = lazyWithRetry(() => import('@/pages/finance/JournalEntryEditorPage'));
const InvoicesPage            = lazyWithRetry(() => import('@/pages/finance/InvoicesPage'));
const InvoiceCreatePage       = lazyWithRetry(() => import('@/pages/finance/InvoiceCreatePage'));
const BillsPage               = lazyWithRetry(() => import('@/pages/finance/BillsPage'));
const BillCreatePage          = lazyWithRetry(() => import('@/pages/finance/BillCreatePage'));
const BankAccountsPage        = lazyWithRetry(() => import('@/pages/finance/BankAccountsPage'));
const AdvancesPage            = lazyWithRetry(() => import('@/pages/finance/AdvancesPage'));
const AdvanceDetailPage      = lazyWithRetry(() => import('@/pages/finance/AdvanceDetailPage'));
const AdvanceEditorPage      = lazyWithRetry(() => import('@/pages/finance/AdvanceEditorPage'));
const ReconciliationPage      = lazyWithRetry(() => import('@/pages/finance/ReconciliationPage'));
const TrialBalancePage        = lazyWithRetry(() => import('@/pages/finance/TrialBalancePage'));
const ProfitAndLossPage       = lazyWithRetry(() => import('@/pages/finance/ProfitAndLossPage'));
const BalanceSheetPage        = lazyWithRetry(() => import('@/pages/finance/BalanceSheetPage'));
const ARAgeingPage            = lazyWithRetry(() => import('@/pages/finance/ARAgeingPage'));
const APAgeingPage            = lazyWithRetry(() => import('@/pages/finance/APAgeingPage'));
const CashFlowPage            = lazyWithRetry(() => import('@/pages/finance/CashFlowPage'));
const GeneralLedgerPage       = lazyWithRetry(() => import('@/pages/finance/GeneralLedgerPage'));
const FinanceKitPage          = lazyWithRetry(() => import('@/pages/finance/FinanceKitPage'));

// Documents
const DocumentsCenterPage     = lazyWithRetry(() => import('@/pages/documents/DocumentsCenterPage'));
const OwnerFolderPage         = lazyWithRetry(() => import('@/pages/documents/OwnerFolderPage'));
const DocumentDetailPage      = lazyWithRetry(() => import('@/pages/documents/DocumentDetailPage'));
const AprodacDocumentsPage    = lazyWithRetry(() => import('@/pages/documents/AprodacDocumentsPage'));

// Reports
const ReportsDashboardPage        = lazyWithRetry(() => import('@/pages/reports/ReportsDashboardPage'));
const FleetPerformancePage        = lazyWithRetry(() => import('@/pages/reports/FleetPerformancePage'));
const RevenueReportsPage          = lazyWithRetry(() => import('@/pages/reports/RevenueReportsPage'));
const CustomReportPage            = lazyWithRetry(() => import('@/pages/reports/CustomReportPage'));
const CompanyReportsGeneratorPage = lazyWithRetry(() => import('@/pages/reports/CompanyReportsGeneratorPage'));
const DelayReportPage             = lazyWithRetry(() => import('@/pages/reports/DelayReportPage'));

// Smart Report Builder
const ReportBuilderLandingPage   = lazyWithRetry(() => import('@/pages/report-builder/ReportBuilderLandingPage'));
const QuickReportPage            = lazyWithRetry(() => import('@/pages/report-builder/QuickReportPage'));
const AdvancedBuilderPage        = lazyWithRetry(() => import('@/pages/report-builder/AdvancedBuilderPage'));

// Learning & Academy
const LearningPage               = lazyWithRetry(() => import('@/pages/learning/LearningPage'));

// Settings & Governance
const OperatorProfilePage     = lazyWithRetry(() => import('@/pages/settings/OperatorProfilePage'));
const SettingsPage            = lazyWithRetry(() => import('@/pages/settings/SettingsPage'));
const UserManagementPage      = lazyWithRetry(() => import('@/pages/settings/UserManagementPage'));
const DocumentTypeAdminPage   = lazyWithRetry(() => import('@/pages/settings/DocumentTypeAdminPage'));
const TaxonomySettingsPage    = lazyWithRetry(() => import('@/pages/settings/TaxonomySettingsPage'));
const BrandingSettingsPage    = lazyWithRetry(() => import('@/pages/settings/BrandingSettingsPage'));
const SystemHealthPage        = lazyWithRetry(() => import('@/pages/settings/SystemHealthPage'));
const AuditLogPage            = lazyWithRetry(() => import('@/pages/settings/AuditLogPage'));
const ModuleGovernancePage    = lazyWithRetry(() => import('@/pages/settings/ModuleGovernancePage'));
const ErrorConsolePage        = lazyWithRetry(() => import('@/pages/settings/ErrorConsolePage'));
const ErrorEventDetailPage    = lazyWithRetry(() => import('@/pages/settings/ErrorEventDetailPage'));
const RecycleBinPage          = lazyWithRetry(() => import('@/pages/recycle-bin/RecycleBinPage'));

/* ─── Protected Route wrapper ────────────────────────────────────────────── */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!authStore.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function QuotationIdRedirect() {
  const { id } = useParams();
  return <Navigate to={`/quotations/${id}/edit`} replace />;
}

/* ─── App Router ─────────────────────────────────────────────────────────── */
export default function AppRouter() {
  useApplyBranding();

  // useTransitions={false} — React Router wraps its internal location state
  // update in React.startTransition by default. Under React 19 that update
  // could get stuck: the transition lanes were left pending and expired with
  // finishedWork already built but never committed, so window.location moved on
  // while the router's own location stayed behind and <Outlet> kept rendering
  // the previous page until a full reload. Plain (non-transition) state updates
  // commit normally, so the router opts out of transitions.
  return (
    <BrowserRouter useTransitions={false}>
      <ErrorBoundary>
        <Routes>
          {/* ── Auth (public) — full-page spinner while chunk loads ─── */}
          <Route
            path="/login"
            element={
              <Suspense fallback={<FullPageSpinner />}>
                <LoginPage />
              </Suspense>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <Suspense fallback={<FullPageSpinner />}>
                <ForgotPasswordPage />
              </Suspense>
            }
          />
          <Route
            path="/trips/evidence-gallery"
            element={
              <Suspense fallback={<FullPageSpinner />}>
                <TripEvidencePublicGalleryPage />
              </Suspense>
            }
          />

          {/* ── Protected layout route ────────────────────────────────
              AppShell renders the sidebar + header ONCE and keeps them
              mounted. <Outlet> renders the active child page. Each page
              still calls DashboardLayout to push its title/active to
              context; DashboardLayout detects the shell and renders only
              its children rather than a duplicate sidebar/header.       */}
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/"            element={<RequireModule moduleKey="dashboard"><DashboardPage /></RequireModule>} />
            <Route path="/notifications" element={<NotificationsPage />} />

            {/* Trips */}
            <Route path="/trips"                    element={<RequireModule moduleKey="trips"><TripListPage /></RequireModule>} />
            <Route path="/trips/kanban"             element={<Navigate to="/trips?view=kanban" replace />} />
            <Route path="/trips/new"                element={<RequireModule moduleKey="trips"><CreateTripPage /></RequireModule>} />
            {/* Literal path before /trips/:id, which would otherwise match it. */}
            <Route path="/trips/monthly"            element={<RequireModule moduleKey="trips"><MonthlyTripsPage /></RequireModule>} />
            <Route path="/trips/monthly/new"        element={<Navigate to="/trips/new?mode=monthly" replace />} />
            <Route path="/trips/:id"                element={<RequireModule moduleKey="trips"><WithIdKey Page={TripDetailsPage} /></RequireModule>} />
            <Route path="/trips/:id/edit"           element={<RequireModule moduleKey="trips"><WithIdKey Page={EditTripPage} /></RequireModule>} />
            <Route path="/trips/:id/track"          element={<RequireModule moduleKey="trips"><WithIdKey Page={TripTrackingPage} /></RequireModule>} />
            <Route path="/trips/:id/completion"     element={<RequireModule moduleKey="trips"><WithIdKey Page={TripCompletionPage} /></RequireModule>} />

            {/* Third Party */}
            <Route path="/third-party"              element={<RequireModule moduleKey="third-party"><ThirdPartyListPage /></RequireModule>} />
            <Route path="/third-party/:id"          element={<RequireModule moduleKey="third-party"><WithIdKey Page={ThirdPartyDetailsPage} /></RequireModule>} />
            <Route path="/drivers"                  element={<RequireModule moduleKey="drivers"><DriverListPage /></RequireModule>} />
            <Route path="/drivers/new"              element={<RequireModule moduleKey="drivers"><AddDriverPage /></RequireModule>} />
            <Route path="/drivers/:id"              element={<RequireModule moduleKey="drivers"><WithIdKey Page={DriverDetailsPage} /></RequireModule>} />
            <Route path="/drivers/:id/edit"         element={<RequireModule moduleKey="drivers"><EditDriverPage /></RequireModule>} />
            <Route path="/drivers/:id/documents"    element={<RequireModule moduleKey="drivers"><DriverDocumentsPage /></RequireModule>} />

            {/* Vehicles */}
            <Route path="/vehicles"                 element={<RequireModule moduleKey="vehicles"><VehicleListPage /></RequireModule>} />
            <Route path="/vehicles/financials"      element={<RequireModule moduleKey="vehicles"><VehicleFinancialsPage /></RequireModule>} />
            <Route path="/vehicles/new"             element={<RequireModule moduleKey="vehicles"><AddVehiclePage /></RequireModule>} />
            <Route path="/vehicles/:id"             element={<RequireModule moduleKey="vehicles"><VehicleDetailsPage /></RequireModule>} />
            <Route path="/vehicles/:id/edit"        element={<RequireModule moduleKey="vehicles"><EditVehiclePage /></RequireModule>} />
            <Route path="/vehicles/:id/documents"   element={<RequireModule moduleKey="vehicles"><VehicleDocumentsPage /></RequireModule>} />
            <Route path="/vehicles/:id/financials"  element={<RequireModule moduleKey="vehicles"><VehicleSingleFinancialsPage /></RequireModule>} />
            <Route path="/maintenance"              element={<RequireModule moduleKey="maintenance"><MaintenanceListPage /></RequireModule>} />
            <Route path="/maintenance/new"          element={<RequireModule moduleKey="maintenance"><AddMaintenancePage /></RequireModule>} />
            <Route path="/maintenance/:id"          element={<RequireModule moduleKey="maintenance"><MaintenanceDetailsPage /></RequireModule>} />
            <Route path="/maintenance/:id/edit"     element={<RequireModule moduleKey="maintenance"><EditMaintenancePage /></RequireModule>} />

            {/* Customers */}
            <Route path="/customers"                          element={<RequireModule moduleKey="customers"><CustomerListPage /></RequireModule>} />
            <Route path="/customers/new"                      element={<RequireModule moduleKey="customers"><AddCustomerPage /></RequireModule>} />
            <Route path="/customers/:id"                      element={<RequireModule moduleKey="customers"><WithIdKey Page={CustomerDetailsPage} /></RequireModule>} />
            <Route path="/customers/:id/edit"                 element={<RequireModule moduleKey="customers"><EditCustomerPage /></RequireModule>} />
            <Route path="/customers/:customerId/locations/create" element={<RequireModule moduleKey="customers"><AddLocationPage /></RequireModule>} />
            <Route path="/customers/:customerId/locations/new"    element={<RequireModule moduleKey="customers"><AddLocationPage /></RequireModule>} />

            {/* Locations */}
            <Route path="/locations"                element={<RequireModule moduleKey="locations"><LocationListPage /></RequireModule>} />
            <Route path="/locations/create"         element={<RequireModule moduleKey="locations"><AddLocationPage /></RequireModule>} />
            <Route path="/locations/new"            element={<RequireModule moduleKey="locations"><AddLocationPage /></RequireModule>} />
            <Route path="/locations/:id"            element={<RequireModule moduleKey="locations"><LocationDetailsPage /></RequireModule>} />

            {/* Master Data Taxonomy & Universal Colors */}
            <Route path="/taxonomy"                 element={<RequireModule moduleKey="taxonomy"><TaxonomyManagementPage /></RequireModule>} />
            <Route path="/master-data/taxonomy"     element={<RequireModule moduleKey="taxonomy"><TaxonomyManagementPage /></RequireModule>} />
            <Route path="/master-data"              element={<Navigate to="/taxonomy" replace />} />

            {/* Commercial Agreements Redirect */}
            <Route path="/commercial-agreements" element={<Navigate to="/quotations" replace />} />

            {/* Quotations (Canonical) & Rate Cards (Legacy Alias) */}
            <Route path="/quotations"               element={<RequireModule moduleKey="quotations"><QuotationListPage /></RequireModule>} />
            <Route path="/quotations/new"           element={<RequireModule moduleKey="quotations"><AddQuotationPage /></RequireModule>} />
            <Route path="/quotations/import"        element={<RequireModule moduleKey="quotations"><QuotationAiImportPage /></RequireModule>} />
            <Route path="/quotations/:id"           element={<QuotationIdRedirect />} />
            <Route path="/quotations/:id/edit"      element={<RequireModule moduleKey="quotations"><EditQuotationPage /></RequireModule>} />
            <Route path="/quotations/:id/documents" element={<RequireModule moduleKey="quotations"><QuotationDocsPage /></RequireModule>} />

            <Route path="/rate-cards"               element={<RequireModule moduleKey="quotations"><QuotationListPage /></RequireModule>} />
            <Route path="/rate-cards/new"           element={<RequireModule moduleKey="quotations"><AddQuotationPage /></RequireModule>} />
            <Route path="/rate-cards/import"        element={<RequireModule moduleKey="quotations"><QuotationAiImportPage /></RequireModule>} />
            <Route path="/rate-cards/:id"           element={<QuotationIdRedirect />} />
            <Route path="/rate-cards/:id/edit"      element={<RequireModule moduleKey="quotations"><EditQuotationPage /></RequireModule>} />
            <Route path="/rate-cards/:id/documents" element={<RequireModule moduleKey="quotations"><QuotationDocsPage /></RequireModule>} />

            {/* Expenses */}
            <Route path="/expenses"                 element={<RequireModule moduleKey="expenses"><ExpenseListPage /></RequireModule>} />
            <Route path="/expenses/:id"             element={<RequireModule moduleKey="expenses"><ExpenseDetailsPage /></RequireModule>} />

            {/* Finance & General Ledger */}
            <Route path="/finance/chart-of-accounts" element={<RequireModule moduleKey="finance"><ChartOfAccountsPage /></RequireModule>} />
            <Route path="/finance/periods"           element={<RequireModule moduleKey="finance"><AccountingPeriodsPage /></RequireModule>} />
            <Route path="/finance/journal-entries"   element={<RequireModule moduleKey="finance"><JournalEntriesPage /></RequireModule>} />
            <Route path="/finance/journal-entries/new" element={<RequireModule moduleKey="finance"><JournalEntryEditorPage /></RequireModule>} />
            <Route path="/finance/journal-entries/:id" element={<RequireModule moduleKey="finance"><WithIdKey Page={JournalEntryDetailPage} /></RequireModule>} />
            <Route path="/finance/journal-entries/:id/edit" element={<RequireModule moduleKey="finance"><WithIdKey Page={JournalEntryEditorPage} /></RequireModule>} />
            <Route path="/finance/invoices/new"      element={<RequireModule moduleKey="finance"><InvoiceCreatePage /></RequireModule>} />
            <Route path="/finance/invoices"          element={<RequireModule moduleKey="finance"><InvoicesPage /></RequireModule>} />
            <Route path="/finance/bills/new"        element={<RequireModule moduleKey="finance"><BillCreatePage /></RequireModule>} />
            <Route path="/finance/bills"             element={<RequireModule moduleKey="finance"><BillsPage /></RequireModule>} />
            <Route path="/finance/bank-accounts"     element={<RequireModule moduleKey="finance"><BankAccountsPage /></RequireModule>} />
            <Route path="/finance/advances"          element={<RequireModule moduleKey="finance"><AdvancesPage /></RequireModule>} />
            <Route path="/finance/advances/new"      element={<RequireModule moduleKey="finance"><AdvanceEditorPage /></RequireModule>} />
            <Route path="/finance/advances/:id"      element={<RequireModule moduleKey="finance"><WithIdKey Page={AdvanceDetailPage} /></RequireModule>} />
            <Route path="/finance/reconciliation"    element={<RequireModule moduleKey="finance"><ReconciliationPage /></RequireModule>} />
            <Route path="/finance/trial-balance"     element={<RequireModule moduleKey="finance"><TrialBalancePage /></RequireModule>} />
            <Route path="/finance/profit-and-loss"    element={<RequireModule moduleKey="finance"><ProfitAndLossPage /></RequireModule>} />
            <Route path="/finance/balance-sheet"     element={<RequireModule moduleKey="finance"><BalanceSheetPage /></RequireModule>} />
            <Route path="/finance/ar-ageing"          element={<RequireModule moduleKey="finance"><ARAgeingPage /></RequireModule>} />
            <Route path="/finance/ap-ageing"          element={<RequireModule moduleKey="finance"><APAgeingPage /></RequireModule>} />
            <Route path="/finance/cash-flow"          element={<RequireModule moduleKey="finance"><CashFlowPage /></RequireModule>} />
            <Route path="/finance/general-ledger"     element={<RequireModule moduleKey="finance"><GeneralLedgerPage /></RequireModule>} />
            {import.meta.env.DEV && (
              <Route path="/finance/_kit"              element={<RequireModule moduleKey="finance"><FinanceKitPage /></RequireModule>} />
            )}
            <Route path="/finance"                   element={<Navigate to="/finance/chart-of-accounts" replace />} />

            {/* Documents */}
            <Route path="/documents"                element={<RequireModule moduleKey="documents"><DocumentsCenterPage /></RequireModule>} />
            <Route path="/documents/expiry"         element={<Navigate to="/documents" replace />} />
            <Route path="/documents/doc/:docId"     element={<RequireModule moduleKey="documents"><DocumentDetailPage /></RequireModule>} />
            <Route path="/docs/:docId"              element={<RequireModule moduleKey="documents"><DocumentDetailPage /></RequireModule>} />
            <Route path="/documents/details/:docId" element={<RequireModule moduleKey="documents"><DocumentDetailPage /></RequireModule>} />
            <Route path="/documents/:ownerType/:ownerId" element={<RequireModule moduleKey="documents"><OwnerFolderPage /></RequireModule>} />
            <Route path="/aprodac-documents"        element={<RequireModule moduleKey="aprodac-documents"><AprodacDocumentsPage /></RequireModule>} />
            <Route path="/aprodac"                  element={<Navigate to="/aprodac-documents" replace />} />

            {/* Custom Report Builder */}
            <Route path="/custom-report"            element={<RequireModule moduleKey="reports"><CustomReportPage /></RequireModule>} />
            <Route path="/reports/custom"          element={<RequireModule moduleKey="reports"><CustomReportPage /></RequireModule>} />

            {/* Reports (Legacy -> Redirect to Company Reports) */}
            <Route path="/reports/*"                element={<Navigate to="/company-reports" replace />} />
            <Route path="/reports"                  element={<Navigate to="/company-reports" replace />} />

            {/* Custom Company Reports Generator */}
            <Route path="/company-reports"          element={<RequireModule moduleKey="company-reports"><CompanyReportsGeneratorPage /></RequireModule>} />

            {/* Smart Report Builder */}
            <Route path="/report-builder"          element={<RequireModule moduleKey="report-builder"><ReportBuilderLandingPage /></RequireModule>} />
            <Route path="/report-builder/quick"    element={<RequireModule moduleKey="report-builder"><QuickReportPage /></RequireModule>} />
            <Route path="/report-builder/advanced" element={<RequireModule moduleKey="report-builder"><AdvancedBuilderPage /></RequireModule>} />

            {/* Learning & Academy */}
            <Route path="/learning"                element={<RequireModule moduleKey="learning"><LearningPage /></RequireModule>} />

            {/* Settings & Governance */}
            <Route path="/settings"                 element={<SettingsPage />} />
            <Route path="/settings/profile"         element={<Navigate to="/settings" replace />} />
            <Route path="/settings/users"           element={<RequireRole roles={['Admin']}><UserManagementPage /></RequireRole>} />
            <Route path="/settings/document-types"  element={<RequireRole roles={['Admin']}><DocumentTypeAdminPage /></RequireRole>} />
            <Route path="/settings/taxonomy"        element={<RequireRole roles={['SuperAdmin']}><TaxonomySettingsPage /></RequireRole>} />
            <Route path="/settings/branding"        element={<RequireRole roles={['SuperAdmin']}><BrandingSettingsPage /></RequireRole>} />
            <Route path="/settings/system-health"   element={<RequireRole roles={['SuperAdmin']}><SystemHealthPage /></RequireRole>} />
            <Route path="/settings/audit-log"       element={<RequireRole roles={['SuperAdmin']}><AuditLogPage /></RequireRole>} />
            <Route path="/settings/module-governance" element={<RequireRole roles={['SuperAdmin']}><ModuleGovernancePage /></RequireRole>} />
            <Route path="/settings/error-console"     element={<RequireRole roles={['Admin']}><ErrorConsolePage /></RequireRole>} />
            <Route path="/settings/error-console/:id" element={<RequireRole roles={['Admin']}><ErrorEventDetailPage /></RequireRole>} />
            <Route path="/settings/recycle-bin"     element={<RequireModule moduleKey="recycle-bin"><RecycleBinPage /></RequireModule>} />
            <Route path="/recycle-bin font-medium"  element={<Navigate to="/settings/recycle-bin" replace />} />
            <Route path="/recycle-bin"              element={<Navigate to="/settings/recycle-bin" replace />} />
            <Route path="/trash"                    element={<Navigate to="/settings/recycle-bin" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
