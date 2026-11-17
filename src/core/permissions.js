'use strict';
/** Every permission the app knows about, grouped for the role editor. */
const PERMISSIONS = {
  Dashboard: { 'dashboard.view': 'See the dashboard' },
  Billing: {
    'billing.create': 'Create bills',
    'billing.edit_price': 'Change prices while billing',
    'billing.cancel': 'Cancel bills',
    'billing.reprint': 'Reprint previous bills',
  },
  Products: {
    'products.view': 'View products and stock',
    'products.view_cost': 'See cost prices and profit',
    'products.manage': 'Add and edit products',
    'inventory.adjust': 'Adjust stock and record damage',
  },
  Customers: {
    'customers.view': 'View customers and ledgers',
    'customers.create': 'Add customers',
    'customers.manage': 'Edit customers and balances',
    'customers.payments': 'Receive customer payments',
  },
  Suppliers: { 'suppliers.manage': 'Manage suppliers and purchases', 'suppliers.payments': 'Pay suppliers' },
  Money: {
    'expenses.manage': 'Record expenses',
    'bank.manage': 'Manage bank and cash accounts',
    'vouchers.manage': 'Create vouchers',
    'daily_sheet.view': 'See the daily sheet',
    'month.close': 'Close a month',
    'month.reopen': 'Reopen a closed month',
  },
  Reports: { 'reports.view': 'View reports', 'reports.export': 'Export reports' },
  System: {
    'backup.manage': 'Back up and restore',
    'settings.manage': 'Change business settings',
    'users.manage': 'Manage users',
    'audit.view': 'View the activity log',
  },
};
const ALL = Object.values(PERMISSIONS).flatMap((g) => Object.keys(g));

const parse = (json) => { try { return JSON.parse(json); } catch { return []; } };
function can(perms, key) { return perms.includes('*') || perms.includes(key); }

module.exports = { PERMISSIONS, ALL, can, parse };
