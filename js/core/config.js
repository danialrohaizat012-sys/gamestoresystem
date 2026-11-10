/* Arcadia POS — static configuration, roles and defaults */
(function () {
  const App = (window.App = window.App || {});

  App.pages = {};
  App.page = (id, def) => (App.pages[id] = { id, ...def });

  App.config = {
    appName: 'Arcadia POS',
    version: '1.0.0',
    storagePrefix: 'arcadia_pos_v1',

    /*
     * Data backend. 'local' keeps everything in this browser (localStorage).
     * Switch to 'supabase' once the schema in /supabase/schema.sql is deployed
     * and the URL + anon key are filled in (see README → Supabase).
     */
    backend: 'local',
    supabase: { url: '', anonKey: '' },
  };

  /* One canonical list of payment methods used by EVERY module, so reports never
     split "QR" vs "QR / DuitNow" vs "DuitNow" (audit finding #5). */
  App.PAYMENT_METHODS = [
    { id: 'cash', label: 'Cash', icon: 'cash' },
    { id: 'qr', label: 'QR / DuitNow', icon: 'qr' },
    { id: 'card', label: 'Card', icon: 'card' },
    { id: 'bank', label: 'Bank Transfer', icon: 'bank' },
    { id: 'ewallet', label: 'E-Wallet', icon: 'phone' },
  ];
  App.paymentLabel = (id) => (App.PAYMENT_METHODS.find((m) => m.id === id) || { label: id || '—' }).label;

  App.ROLES = {
    owner: { label: 'Owner', perms: ['*'] },
    manager: {
      label: 'Manager',
      perms: [
        'dashboard.finance', 'pos', 'pos.price', 'buy', 'trade', 'repairs', 'after_sales', 'inventory',
        'inventory.edit', 'inventory.cost', 'inventory.adjust', 'purchases', 'consignment', 'transactions',
        'transactions.void', 'customers', 'reports', 'shift', 'shift.override', 'stock_take',
      ],
    },
    cashier: {
      label: 'Cashier',
      perms: ['pos', 'buy', 'trade', 'repairs', 'after_sales', 'inventory', 'transactions', 'customers', 'shift'],
    },
    technician: { label: 'Technician', perms: ['repairs', 'inventory', 'customers'] },
  };

  App.CATEGORY_PREFIX = {
    Console: 'CON', Games: 'GAM', Controller: 'CTL', Accessories: 'ACC',
    Collectibles: 'COL', 'Gift Cards': 'GFT', 'Repair Parts': 'PRT', Merchandise: 'MER',
  };

  App.REPAIR_STATUSES = [
    { id: 'received', label: 'Received', tone: 'info' },
    { id: 'diagnosing', label: 'Diagnosing', tone: 'violet' },
    { id: 'waiting_parts', label: 'Waiting Parts', tone: 'warning' },
    { id: 'in_progress', label: 'In Progress', tone: 'accent' },
    { id: 'ready', label: 'Ready for Pickup', tone: 'success' },
    { id: 'collected', label: 'Collected', tone: 'muted' },
    { id: 'cancelled', label: 'Cancelled', tone: 'danger' },
  ];

  /* QC checklist templates used when buying used items from customers */
  App.QC_TEMPLATES = {
    Console: ['Powers on', 'Display / HDMI output', 'Disc drive reads', 'Controller pairs', 'USB ports', 'Wi-Fi / Bluetooth', 'Fan noise normal', 'No ban / account locked', 'Physical condition'],
    Controller: ['All buttons', 'No stick drift', 'Triggers / bumpers', 'Vibration', 'Charging port', 'Battery holds charge', 'Physical condition'],
    Games: ['Disc surface', 'Boots & plays', 'Case & cover art', 'Code / DLC used'],
    Accessories: ['Functional test', 'Cables included', 'Physical condition'],
    _default: ['Functional test', 'Physical condition'],
  };

  App.DEFAULT_SETTINGS = {
    id: 'store',
    store_name: 'Pixel Harbor Games',
    legal_name: 'Pixel Harbor Trading',
    registration_no: '202601012345 (1234567-A)',
    tagline: 'Buy · Sell · Trade · Repair',
    address: '12, Jalan Arked 3, Taman Konsol\n50450 Kuala Lumpur, Malaysia',
    phone: '03-1234 5678',
    whatsapp: '60123456789',
    email: 'hello@pixelharbor.games',
    website: 'pixelharbor.games',
    logo_text: 'PH',
    logo_mode: 'pixel', // pixel | letters | image
    logo_icon: 'anchor',
    logo_image: '',
    accent: '#7c5cff',
    accent2: '#22d3ee',
    currency: 'RM',
    country_code: '60',
    receipt_paper: '80mm',
    receipt_footer: 'Thank you for gaming with us! Goods sold are not refundable after 7 days. Keep this receipt for warranty claims.',
    tax_enabled: false,
    tax_label: 'SST',
    tax_rate: 8,
    tax_inclusive: true,
    warranty_new_days: 365,
    warranty_used_days: 30,
    warranty_repair_days: 30,
    refund_window_days: 7,
    loyalty_enabled: true,
    loyalty_rate: 1, // points per 1 currency unit
    require_shift_for_cash: true,
    categories: ['Console', 'Games', 'Controller', 'Accessories', 'Collectibles', 'Gift Cards', 'Repair Parts'],
    platforms: ['PS5', 'PS4', 'Nintendo Switch', 'Switch 2', 'Xbox Series', 'PC', 'Retro', 'Multi'],
    go_live_at: null,
  };
})();
