// The app's navigation map. `stage` marks modules that are scheduled but not built yet.
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard.view', top: true },
  { group: 'Sell', items: [
    { id: 'billing', label: 'New sale', icon: 'cart', key: 'F1', perm: 'billing.create', stage: 4,
      about: 'Fast retail and wholesale billing with customer search, pack/carton/crate entry, udhaar and thermal or A4 printing.' },
    { id: 'customers', label: 'Customers', icon: 'users', key: 'F3', perm: 'customers.view', stage: 3,
      about: 'Customer accounts, udhaar balances, payments received, statements and full ledgers.' },
  ] },
  { group: 'Stock', items: [
    { id: 'products', label: 'Products and stock', icon: 'box', key: 'F2', perm: 'products.view',
      about: 'Products with pack, carton and crate conversions, three price levels, stock movements and low-stock alerts.' },
    { id: 'purchases', label: 'Purchases', icon: 'truck', key: 'F4', perm: 'suppliers.manage', stage: 5,
      about: 'Purchase entry, purchase returns and corrections that raise stock and update supplier balances.' },
    { id: 'suppliers', label: 'Suppliers', icon: 'book', perm: 'suppliers.manage', stage: 3,
      about: 'Supplier accounts, payables, payments and printable statements.' },
    { id: 'empties', label: 'Empties', icon: 'repeat', perm: 'products.manage', stage: 5,
      about: 'Separate ledgers for empties with each customer and supplier, and the empties physically in your shop.' },
  ] },
  { group: 'Money', items: [
    { id: 'expenses', label: 'Expenses', icon: 'wallet', perm: 'expenses.manage', stage: 6, about: 'Daily and monthly expenses with custom categories.' },
    { id: 'bank', label: 'Bank and cash', icon: 'bank', perm: 'bank.manage', stage: 6, about: 'Cash and bank accounts, deposits, withdrawals, transfers and charges.' },
    { id: 'vouchers', label: 'Vouchers', icon: 'file', perm: 'vouchers.manage', stage: 6, about: 'Payment, receipt, journal, expense and adjustment vouchers with double-entry posting.' },
    { id: 'dailysheet', label: 'Daily sheet', icon: 'calcheck', perm: 'daily_sheet.view', stage: 6, about: 'Opening cash to closing cash for any date, computed from real transactions.' },
    { id: 'closing', label: 'Monthly closing', icon: 'lock', perm: 'month.close', stage: 6, about: 'Month-end profit, saved closing snapshots and controlled reopening.' },
  ] },
  { group: 'Insights', items: [
    { id: 'reports', label: 'Reports', icon: 'chart', key: 'F5', perm: 'reports.view', stage: 7, about: 'Sales, purchase, profit, stock, ledger and empties reports with PDF and Excel export.' },
  ] },
  { group: 'System', items: [
    { id: 'backup', label: 'Backup', icon: 'db', perm: 'backup.manage' },
    { id: 'settings', label: 'Settings', icon: 'sliders' },
    { id: 'users', label: 'Users', icon: 'shield', perm: 'users.manage' },
    { id: 'activity', label: 'Activity log', icon: 'activity', perm: 'audit.view' },
  ] },
];
export const flat = () => NAV.flatMap((n) => (n.items ? n.items : [n]));
export const can = (user, perm) => !perm || user.permissions.includes('*') || user.permissions.includes(perm);
export const titleOf = (id) => flat().find((n) => n.id === id)?.label || 'Bismillah Traders POS';
