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
  { href: '/operator-app/', label: 'Operator app' },
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
          'Start from a recent trip or a saved route in one tap',
          'Suggested drivers ranked by where their last trip ends',
          'Road distance, drive time and margin before you dispatch',
          'Co-driver, AWB number and extra charges on the same trip',
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
          'Search a lane like “riyadh to jeddah” or a place to see trucks near it',
          'Road distance and ETA to the next stop, with on-time status',
          'Driver view and a dark map for night shifts',
        ],
      },
      {
        key: 'quotations',
        name: 'Quotations',
        summary: 'Price, send and track quotes, then turn them into trips.',
        points: [
          'Rate cards and a rate finder for lanes you already priced',
          'Compare one lane’s price across every customer: low, average, high',
          'Branded PDF quotations',
          'Import existing quotes with AI-assisted extraction',
          'Expiry alerts before a quote lapses',
          'Create a trip straight from a quotation',
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
          'Ready / not ready at a glance before you dispatch',
          'Licence expiry flagged on the driver list',
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
          'Share a live ETA from the operator app over WhatsApp',
          'Links expire on their own; see which ones were opened',
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
      'Today at a glance: trips done, on the road and still to start',
      'Create a trip in three steps, with suggested drivers and the margin up front',
      'Full-screen live trip with road distance and ETA to the next stop',
      'Fleet map with lane and nearby-place search',
      'Quotations, rate finder and one-tap trip from a quote',
      'Drivers, trucks, customers, invoices and expenses',
      'Push alerts for delays and expiring documents',
    ],
    phones: [
      { src: '/screens/op-home.webp', alt: 'Operator app home', caption: 'Today' },
      { src: '/screens/op-create-who.webp', alt: 'Create trip: driver and truck', caption: 'Create trip' },
      { src: '/screens/op-live.webp', alt: 'Live trip on the map', caption: 'Live trip' },
      { src: '/screens/op-fleet.webp', alt: 'Fleet map', caption: 'Fleet map' },
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

// The operator app page (/operator-app/): one section per job, real screens on sample data.
export type Tour = {
  id: string;
  label: string;
  title: string;
  text: string;
  points: string[];
  phones: Screenshot[];
  /** Number the phones as steps (01, 02 …) instead of plain captions. */
  steps?: boolean;
};

export const operatorTour: Tour[] = [
  {
    id: 'create',
    label: 'Create a trip',
    title: 'A new trip in three steps.',
    text: 'Job, when, who. The price comes from the customer’s quotation, the drive time from the road network, and the best drivers are suggested for you — so the margin is on screen before anything is dispatched.',
    points: [
      'Start from a recent trip or a saved route in one tap',
      'Quotation price and driver pay filled in, editable',
      'Exact map pins confirmed for every stop',
      'Planned arrival suggested from the road drive time',
      'Drivers ranked by fit: free now, ending near the pickup, idle',
      'Own fleet or a 3PL partner, co-driver and AWB number',
      'Review the whole trip and its margin, then create',
    ],
    steps: true,
    phones: [
      { src: '/screens/op-create-job.webp', alt: 'Create trip step 1: customer, price and route', caption: 'Job — customer, quotation and route' },
      { src: '/screens/op-create-when.webp', alt: 'Create trip step 2: schedule and route timing', caption: 'When — pickup time and drive time' },
      { src: '/screens/op-create-who.webp', alt: 'Create trip step 3: suggested drivers', caption: 'Who — the best drivers for this trip' },
      { src: '/screens/op-create-review.webp', alt: 'Review trip before creating', caption: 'Review — schedule, driver and margin' },
    ],
  },
  {
    id: 'live',
    label: 'Follow it live',
    title: 'Every running trip, live on the map.',
    text: 'Open any trip full screen and see the truck move along the road, the distance left and the ETA to the next stop — and whether it is on time. One tap shares that ETA with the customer.',
    points: [
      'Road distance and ETA to the next stop',
      'On-time or late, worked out from the plan',
      'Driven path and the road ahead on one map',
      'Speed, GPS freshness and phone or tracker feed',
      'Call the driver or share the ETA on WhatsApp',
      'Driver view and a dark map for night shifts',
    ],
    phones: [
      { src: '/screens/op-live.webp', alt: 'Live trip Riyadh to Jeddah', caption: 'Live trip — 428 km to Jeddah DC' },
      { src: '/screens/op-live-2.webp', alt: 'Live trip Riyadh to Abha', caption: 'Another truck, heading for Abha' },
      { src: '/screens/op-trip.webp', alt: 'Trip details with map', caption: 'The trip: route, driver and progress' },
      { src: '/screens/op-trip-stops.webp', alt: 'Trip stops with planned and actual times', caption: 'Stops: planned, arrived and left' },
    ],
  },
  {
    id: 'fleet',
    label: 'The whole fleet',
    title: 'Your day, then your fleet.',
    text: 'Home tells you what happened today and what needs you next. The fleet map shows every truck, what it is doing and where it is free, with search by plate, driver, place or lane.',
    points: [
      'Trips done, on the road and still to start',
      '“Needs you” list: unassigned trips, expiring documents',
      'Live trip cards with a mini map for each truck',
      'Fleet map: on trip, delayed and free trucks',
      'Find trucks near a place or along a lane',
      'Schedule by day for the trips coming up',
    ],
    phones: [
      { src: '/screens/op-home.webp', alt: 'Operator app home', caption: 'Home — today and what needs you' },
      { src: '/screens/op-fleet.webp', alt: 'Fleet map', caption: 'Fleet map — 6 of 24 trucks working' },
      { src: '/screens/op-trips.webp', alt: 'Trips on the road', caption: 'Trips on the road now' },
      { src: '/screens/op-schedule.webp', alt: 'Trip schedule by day', caption: 'Schedule — tomorrow’s trips' },
    ],
  },
  {
    id: 'pricing',
    label: 'Price on the spot',
    title: 'Quote with confidence, from anywhere.',
    text: 'Every customer’s rates are in your pocket. Compare a lane across all of them before you answer a call, and turn a quotation into a trip with one tap.',
    points: [
      'Rate finder: one lane across every customer',
      'Lowest, average and highest price per truck size',
      'Driver pay and margin on every rate',
      'How often a rate is used, and when it was last used',
      'Create, duplicate or share a quotation',
    ],
    phones: [
      { src: '/screens/op-ratefinder.webp', alt: 'Rate finder Riyadh to Jeddah', caption: 'Rate finder — 5 rates for one lane' },
      { src: '/screens/op-quotation.webp', alt: 'Quotation details', caption: 'A quotation — create a trip from it' },
      { src: '/screens/op-quotations.webp', alt: 'Quotations by customer', caption: 'Quotations by customer' },
    ],
  },
  {
    id: 'people',
    label: 'People and trucks',
    title: 'Know who is ready before you dispatch.',
    text: 'Each driver’s phone reports back — app version, battery, notifications, location permission — so you know who will actually receive the trip. Trucks, customers and their history are one tap away.',
    points: [
      'Driver app readiness: ready, check, not ready, not installed',
      'Licence expiry and documents per driver and truck',
      'Where each truck is right now, from phone or tracker',
      'Customer page with trips, sharing, invoices, quotes and places',
      'Call or WhatsApp any driver or contact directly',
    ],
    phones: [
      { src: '/screens/op-drivers.webp', alt: 'Drivers with phone readiness', caption: 'Drivers — phone readiness' },
      { src: '/screens/op-driver.webp', alt: 'Driver details', caption: 'A driver, right now' },
      { src: '/screens/op-vehicle.webp', alt: 'Truck details', caption: 'A truck and its location' },
      { src: '/screens/op-customer.webp', alt: 'Customer details', caption: 'A customer and their trips' },
    ],
  },
];
