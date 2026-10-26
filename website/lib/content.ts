// All site copy lives here so pages stay layout-only. Every module and
// feature listed below exists in the Linaul codebase (web dashboard, API,
// operator app, driver app); items still being built are flagged `soon`.

export const site = {
  name: 'Linaul',
  tagline: 'The operating system for trucking companies.',
  // Placeholder — replace with the real sales inbox before going live.
  contactEmail: 'hello@linaul.com',
};

export const nav = [
  { href: '/', label: 'Overview' },
  { href: '/modules/', label: 'Modules' },
  { href: '/apps/', label: 'Apps' },
];

export type Module = {
  key: string;
  name: string;
  summary: string;
  points: string[];
  soon?: boolean;
};

export type Screenshot = { src: string; alt: string; caption?: string };

// Screenshots of the real product on fictional sample data, keyed by module.
export const moduleShots: Record<string, Screenshot[]> = {
  trips: [
    { src: '/screens/web-trips.webp', alt: 'Trip ledger', caption: 'Trip ledger with today, in-transit and delayed counts' },
    { src: '/screens/web-createtrip.webp', alt: 'Create trip', caption: 'Create trip: quotation, suggested drivers and live margin' },
    { src: '/screens/web-tripdetail.webp', alt: 'Trip details', caption: 'Trip details with route, stops and billing' },
    { src: '/screens/web-monthly.webp', alt: 'Monthly trips', caption: 'Monthly runs per customer and lane' },
  ],
  'live-map': [{ src: '/screens/web-livemap.webp', alt: 'Live map', caption: 'Live operations map' }],
  quotations: [{ src: '/screens/web-quotations.webp', alt: 'Quotations', caption: 'Quotations per customer' }],
  locations: [{ src: '/screens/web-locations.webp', alt: 'Locations', caption: 'Locations with exact pins' }],
  vehicles: [
    { src: '/screens/web-vehicles.webp', alt: 'Trucks', caption: 'Fleet list with status and capacity' },
    { src: '/screens/web-vehicle.webp', alt: 'Truck details', caption: 'Truck details, trips and document validity' },
  ],
  drivers: [{ src: '/screens/web-drivers.webp', alt: 'Drivers', caption: 'Driver ledger with app readiness and licences' }],
  maintenance: [{ src: '/screens/web-maintenance.webp', alt: 'Maintenance', caption: 'Trucks in the workshop and service costs' }],
  documents: [{ src: '/screens/web-documents.webp', alt: 'Documents', caption: 'Expired, expiring and missing documents at a glance' }],
  customers: [{ src: '/screens/web-customers.webp', alt: 'Customers', caption: 'Customer accounts with live trips' }],
  tracking: [
    { src: '/screens/web-ttrack.webp', alt: 'Customer trip tracking page', caption: 'What your customer sees: one trip' },
    { src: '/screens/web-ctrack.webp', alt: 'Customer fleet tracking page', caption: 'A key account’s page for all their trips' },
  ],
  invoices: [{ src: '/screens/web-invoices.webp', alt: 'Invoices', caption: 'Invoices with balances and payment status' }],
  expenses: [{ src: '/screens/web-expenses.webp', alt: 'Expenses', caption: 'Expenses by category' }],
  statements: [{ src: '/screens/web-profit.webp', alt: 'Trip profitability', caption: 'Margin on every trip' }],
  dashboard: [{ src: '/screens/web-dash.webp', alt: 'Dashboard', caption: 'Live map, alerts and the active fleet' }],
  branding: [{ src: '/screens/web-branding.webp', alt: 'Branding settings', caption: 'Name, logo and colours' }],
  governance: [{ src: '/screens/web-modules.webp', alt: 'Module settings', caption: 'Switch modules on, off or “coming soon”' }],
};

export type ModuleGroup = {
  id: string;
  title: string;
  intro: string;
  modules: Module[];
};

export const moduleGroups: ModuleGroup[] = [
  {
    id: 'operations',
    title: 'Operations',
    intro: 'Plan, dispatch and run every trip from quote to proof of delivery.',
    modules: [
      {
        key: 'trips',
        name: 'Trips',
        summary: 'The full trip lifecycle in one record — draft, dispatch, pickup, delivery, completion.',
        points: [
          'Multi-stop and round trips with legs on their own dates',
          'Assign driver and truck now, or leave for later as a draft',
          'Monthly recurring runs with overlap warnings',
          'Replace driver mid-trip, cancel, or edit actual times',
        ],
      },
      {
        key: 'live-map',
        name: 'Live Map',
        summary: 'Every active truck on one map, streamed from the driver app.',
        points: [
          'Real-time GPS over WebSockets',
          'Automatic arrival detection at each stop',
          'Driver breaks and stops visible on the route',
          'Find the nearest suitable truck for a new load',
        ],
      },
      {
        key: 'quotations',
        name: 'Quotations',
        summary: 'Price, send and track quotes, then turn them into trips.',
        points: [
          'Rate cards and a rate finder for lanes you already priced',
          'Branded PDF quotations',
          'Import existing quotes with AI-assisted extraction',
          'Expiry alerts before a quote lapses',
        ],
      },
      {
        key: 'delay',
        name: 'Delay Reporting',
        summary: 'Know which trips ran late, where, and why.',
        points: [
          'Delay log with reasons per stop',
          'On-time grid across customers and lanes',
          'Delay analysis to spot repeat problems',
        ],
      },
      {
        key: 'locations',
        name: 'Locations',
        summary: 'A shared address book of sites with exact map pins.',
        points: [
          'Pickup, offload and depot locations',
          '“Pin needed” flags until a precise point is set',
          'Geocoded search while creating trips',
        ],
      },
      {
        key: 'third-party',
        name: 'Third-party Carriers',
        summary: 'Subcontract loads and keep them in the same trip board.',
        points: [
          'Carrier directory with contacts and terms',
          'External trips tracked alongside your own fleet',
        ],
      },
    ],
  },
  {
    id: 'fleet',
    title: 'Fleet & People',
    intro: 'Trucks, drivers and their paperwork — always current, never expired by surprise.',
    modules: [
      {
        key: 'vehicles',
        name: 'Vehicles',
        summary: 'Every truck with its type, capacity, documents and availability.',
        points: [
          'Vehicle documents with renewal reminders',
          'Cargo compatibility by vehicle type',
          'Fleet utilisation by day, week and month',
        ],
      },
      {
        key: 'vehicle-pnl',
        name: 'Vehicle P&L',
        summary: 'Profit and loss per truck, not just per company.',
        points: [
          'Fleet-wide statement and per-truck statements',
          'Cost setup for fixed and running costs',
          'Revenue from trips matched to each vehicle',
        ],
      },
      {
        key: 'drivers',
        name: 'Drivers',
        summary: 'Driver profiles, licences, documents and app access in one place.',
        points: [
          'Phone + licence-number login for the driver app',
          'Performance overview and trip history',
          'Driver pay, advances and settlements',
          'Phone health check: GPS, battery and notification status',
        ],
      },
      {
        key: 'maintenance',
        name: 'Maintenance',
        summary: 'Service and repair records tied to each vehicle.',
        points: [
          'Maintenance log with costs',
          'Feeds directly into Vehicle P&L',
        ],
      },
      {
        key: 'documents',
        name: 'Documents',
        summary: 'A document centre for company, driver and vehicle files.',
        points: [
          'Folders per owner with custom document types',
          'Expiry tracking and alerts',
          'Private files served through signed, expiring links',
        ],
      },
    ],
  },
  {
    id: 'commercial',
    title: 'Customers',
    intro: 'Keep customers informed without a single phone call.',
    modules: [
      {
        key: 'customers',
        name: 'Customers',
        summary: 'Customer accounts with trips, invoices and balances on one page.',
        points: [
          'Contacts, terms and billing details',
          'Trips this month and outstanding receivables',
          'Branded customer logos across quotes and invoices',
        ],
      },
      {
        key: 'tracking',
        name: 'Tracking Links',
        summary: 'Share a live tracking page with your customer — no login required.',
        points: [
          'Public page with truck position and trip timeline',
          'Delivery photos as proof, in a shareable gallery',
          'Fleet-level tracking page for key accounts',
          'One-tap “Ask us” button to your operations WhatsApp',
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    intro: 'Full double-entry accounting built around trips, not bolted on afterwards.',
    modules: [
      {
        key: 'invoices',
        name: 'Invoices & Bills',
        summary: 'Invoice customers from completed trips and record supplier bills.',
        points: [
          'Draft, issue, part-pay and settle',
          'Extra charges and surcharge rules',
          'AR and AP ageing',
        ],
      },
      {
        key: 'expenses',
        name: 'Expenses',
        summary: 'Trip and company expenses with receipts attached.',
        points: [
          'Fuel, tolls and trip costs per trip',
          'Driver-submitted charges from the app',
        ],
      },
      {
        key: 'ledger',
        name: 'Accounting',
        summary: 'Chart of accounts, journals and a general ledger.',
        points: [
          'Journal entries, contra entries and bank accounts',
          'Bank reconciliation',
          'Accounting periods: open, close and lock',
        ],
      },
      {
        key: 'statements',
        name: 'Financial Statements',
        summary: 'Statements that are always up to date.',
        points: [
          'Profit & loss, balance sheet, cash flow',
          'Trial balance and VAT return',
          'Trip profitability',
        ],
      },
      {
        key: 'zatca',
        name: 'ZATCA E-invoicing',
        summary: 'Saudi Fatoora Phase 2 compliance for your invoices.',
        points: ['Device onboarding and certificates', 'Signed invoices with QR codes'],
        soon: true,
      },
    ],
  },
  {
    id: 'insight',
    title: 'Reports',
    intro: 'Answers for the owner, the ops desk and the accountant.',
    modules: [
      {
        key: 'dashboard',
        name: 'Dashboard',
        summary: 'Today’s operation at a glance.',
        points: ['Active trips, available trucks, expiring documents', 'Revenue and status charts'],
      },
      {
        key: 'reports',
        name: 'Reports',
        summary: 'Ready-made reports for fleet, drivers and revenue.',
        points: [
          'Fleet and driver performance',
          'Revenue reports',
          'Your customer’s own Excel layout, filled automatically',
        ],
      },
      {
        key: 'report-builder',
        name: 'Report Builder',
        summary: 'Build your own reports without asking a developer.',
        points: ['Quick reports and an advanced builder', 'Export to Excel'],
      },
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    intro: 'Make Linaul yours — your brand, your modules, your rules.',
    modules: [
      {
        key: 'branding',
        name: 'Branding',
        summary: 'Your logo, colours and company name across web, apps and PDFs.',
        points: ['White-label web dashboard', 'Per-company mobile configuration'],
      },
      {
        key: 'governance',
        name: 'Module Control',
        summary: 'Turn modules on or off per company.',
        points: ['Disabled modules are blocked in the API, not just hidden', 'Start small, switch on more as you grow'],
      },
      {
        key: 'users',
        name: 'Users & Roles',
        summary: 'Three clear roles: Admin, Operator and Driver.',
        points: ['Role checks enforced on every request', 'Audit log of who changed what'],
      },
      {
        key: 'system',
        name: 'Data Safety',
        summary: 'Mistakes are recoverable.',
        points: ['Recycle bin for deleted records', 'Data cleanup tools', 'System health and error console'],
      },
    ],
  },
];

export const flow = [
  { n: '01', title: 'Quote', text: 'Price the lane from your rate cards and send a branded quote.' },
  { n: '02', title: 'Plan', text: 'Create the trip with stops, cargo, driver and truck.' },
  { n: '03', title: 'Dispatch', text: 'The driver is notified on their phone instantly.' },
  { n: '04', title: 'Track', text: 'Live GPS, photos at every stop, automatic arrival times.' },
  { n: '05', title: 'Bill', text: 'Invoice from the completed trip. The books update themselves.' },
];

export type AppInfo = {
  id: string;
  label: string;
  name: string;
  audience: string;
  summary: string;
  features: string[];
  browsers?: Screenshot[];
  phones?: Screenshot[];
};

export const apps: AppInfo[] = [
  {
    id: 'web',
    label: 'Web',
    name: 'Web Dashboard',
    audience: 'Admins and operators',
    summary: 'The control room. Every module, every report, the full accounting suite.',
    features: [
      'Trip board, live map and dispatch',
      'Fleet, drivers, customers and documents',
      'Finance, statements and VAT',
      'Reports, report builder and settings',
    ],
    browsers: [
      { src: '/screens/web-dash.webp', alt: 'Dashboard', caption: 'Dashboard' },
      { src: '/screens/web-tripdetail.webp', alt: 'Trip details', caption: 'Trip details' },
    ],
  },
  {
    id: 'operator',
    label: 'iOS · Android',
    name: 'Operator App',
    audience: 'Operators and admins on the move',
    summary: 'Run the operation from your phone — create, dispatch and follow trips anywhere.',
    features: [
      'Live trip cards and fleet map',
      'Create and edit trips, replace drivers',
      'Quotations with rate finder and PDF',
      'Customers, vehicles, drivers, invoices and expenses',
      'Push alerts for delays and expiring documents',
    ],
    phones: [
      { src: '/screens/op-trips.webp', alt: 'Operator app trips', caption: 'Trips now' },
      { src: '/screens/op-drivers.webp', alt: 'Operator app drivers', caption: 'Driver phone readiness' },
      { src: '/screens/op-quotations.webp', alt: 'Operator app quotations', caption: 'Quotations' },
      { src: '/screens/op-invoices.webp', alt: 'Operator app invoices', caption: 'Invoices' },
    ],
  },
  {
    id: 'driver',
    label: 'iOS · Android',
    name: 'Driver App',
    audience: 'Drivers',
    summary: 'Built for the cab. Big buttons, few steps, works in English and Urdu.',
    features: [
      'Straight-through flow: arrive, photo, deliver, done',
      'Proof-of-delivery photos at every stop',
      'Live GPS while the trip is running',
      'Emergency button, documents and assigned vehicle',
      'Charges, performance and notifications',
    ],
    phones: [
      { src: '/screens/driver-login.webp', alt: 'Driver sign in', caption: 'Phone + licence sign-in' },
      { src: '/screens/driver-home.webp', alt: 'Driver home', caption: 'The trip in progress' },
      { src: '/screens/driver-delivery.webp', alt: 'Delivery photos', caption: 'Proof of delivery photos' },
      { src: '/screens/driver-charges.webp', alt: 'Driver charges', caption: 'What the driver has earned' },
    ],
  },
  {
    id: 'tracking',
    label: 'Browser',
    name: 'Customer Tracking',
    audience: 'Your customers',
    summary: 'A link you send, not an app they install. Live position, timeline and photos.',
    features: [
      'Live truck position and ETA timeline',
      'Delivery photo gallery',
      'Multilingual tracking page',
      'Direct WhatsApp contact to your ops team',
    ],
    browsers: [
      { src: '/screens/web-ttrack.webp', alt: 'Trip tracking page', caption: 'One trip, live' },
      { src: '/screens/web-ctrack.webp', alt: 'Fleet tracking page', caption: 'All trips for one customer' },
    ],
  },
];

export const principles = [
  { title: 'One record per trip', text: 'Ops, drivers, customers and accounting all read and write the same trip. No re-typing between systems.' },
  { title: 'Proof by default', text: 'Photos, timestamps and GPS are captured as the work happens, so disputes end with evidence.' },
  { title: 'Modular', text: 'Switch on only the modules you need. Add finance, quotations or reports when you are ready.' },
  { title: 'Your brand', text: 'Your name and logo on the dashboard, the apps, the tracking page and every PDF.' },
];
