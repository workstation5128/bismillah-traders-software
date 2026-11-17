'use strict';
/**
 * End-to-end UI check using headless Chromium against the dev harness (same renderer + same back-end API).
 *   node tools/ui-check.js [screenshotDir]
 * Needs the `playwright` package and a Chromium build.
 */
const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright')); }

const shots = process.argv[2] || path.join(os.tmpdir(), 'bt-shots'); fs.mkdirSync(shots, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-ui-')); const PORT = 5199;
const results = []; const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'dev-server.js'), String(PORT), dataDir], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  const problems = []; page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
  const base = `http://127.0.0.1:${PORT}/`;
  try {
    // ---- first run ----
    await page.goto(base); await page.waitForSelector('.auth-card');
    ok('first run shows owner-account setup (no default login)', (await page.textContent('.auth-card h2')).includes('Create the owner account'));
    ok('logo emblem loads on setup screen', await page.$eval('.auth-hero img.emblem', (i) => i.complete && i.naturalWidth > 500));
    await shot('01-setup');
    await page.fill('[name=displayName]', 'Haji Owner'); await page.fill('[name=username]', 'owner');
    await page.fill('[name=password]', '123'); await page.fill('[name=confirm]', '123'); await page.click('button[type=submit]');
    await page.waitForSelector('.form-error'); ok('weak password rejected with a clear message', (await page.textContent('.form-error')).includes('at least 6'));
    await page.fill('[name=password]', 'secret123'); await page.fill('[name=confirm]', 'different'); await page.click('button[type=submit]');
    ok('mismatched confirm rejected', (await page.textContent('.form-error')).includes('do not match'));
    await page.fill('[name=confirm]', 'secret123'); await page.click('button[type=submit]');
    await page.waitForSelector('.banner');

    // ---- dashboard ----
    ok('dashboard greets the user', (await page.textContent('.hello')).includes('Haji'));
    ok('dashboard shows business name', (await page.textContent('.banner')).includes('Bismillah Traders'));
    ok('dashboard banner logo loads', await page.$eval('.banner img.emblem', (i) => i.complete && i.naturalWidth > 200));
    const kpiText = await page.$$eval('.kpi .val', (els) => els.map((e) => e.textContent));
    ok('fresh dashboard: 10 cards empty, only stock value is a real Rs. 0.00', kpiText.length === 11 && kpiText.filter((t) => t === '\u2014').length === 10 && kpiText.includes('Rs. 0.00'), kpiText.join(','));
    ok('no invented amounts on a fresh dashboard', ((await page.textContent('.view')).match(/Rs\.\s*[\d,]+\.\d\d/g) || []).every((m) => m === 'Rs. 0.00'));
    ok('data-safety card reports healthy DB', (await page.textContent('.health')).includes('Database healthy'));
    ok('top bar says no backup yet', (await page.textContent('.topbar')).includes('No backup yet'));
    await shot('02-dashboard');
    const c1 = await page.textContent('.clock .t'); const d1 = await page.textContent('.clock .d'); await page.waitForTimeout(2100); const c2 = await page.textContent('.clock .t');
    ok('top-bar clock shows 12-hour time with seconds and ticks every second', /^\d{1,2}:\d{2}:\d{2} (AM|PM)$/.test(c1) && c1 !== c2, `${c1} -> ${c2}`);
    const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
    ok('top-bar date is today (DD/MM/YYYY) with weekday', d1.includes(`${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`) && /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),/.test(d1), d1);
    await page.screenshot({ path: path.join(shots, 'clock-a.png'), clip: { x: 900, y: 0, width: 540, height: 64 } }); await page.waitForTimeout(3000); await page.screenshot({ path: path.join(shots, 'clock-b.png'), clip: { x: 900, y: 0, width: 540, height: 64 } });
    await page.click('.segmented button:has-text("Month")'); await page.fill('input[type=month]', '2026-09');
    await page.waitForFunction(() => document.querySelector('.banner .biz + .biz, .banner .biz:nth-of-type(2)')?.textContent.includes('September 2026'));
    ok('month selector re-runs summary for chosen month', true);
    await page.click('.segmented button:has-text("Day")'); await page.fill('input[type=date]', '2026-03-05');
    await page.waitForFunction(() => document.body.textContent.includes('5 March 2026')); ok('date selector re-runs summary for chosen day', true);

    // ---- navigation / shortcuts ----
    await page.keyboard.press('F1'); await page.waitForSelector('text=is not built yet');
    ok('F1 opens New sale (honest "not built yet" page with its stage)', (await page.textContent('.view')).includes('Stage 4'));
    await shot('03-placeholder');
    await page.keyboard.press('Control+k'); await page.waitForSelector('.palette'); await page.keyboard.type('supp'); await page.waitForTimeout(150);
    ok('Ctrl+K palette filters screens', (await page.$$eval('.palette li', (l) => l.length)) === 1); await shot('04-palette');
    await page.keyboard.press('Enter'); await page.waitForSelector('text=Suppliers is not built yet'); ok('palette navigates', true);


    // ---- products and stock ----
    await page.keyboard.press('F2'); await page.waitForSelector('text=No products yet'); ok('F2 opens Products (empty state, no sample products)', true); await shot('03b-products-empty');
    await page.click('.page-head >> text=Add product'); await page.waitForSelector('.modal.wide');
    await page.fill('[name=name]', 'Cola'); await page.fill('[name=brand]', 'Coca-Cola'); await page.fill('[name=category]', 'Soft drinks'); await page.fill('[name=size]', '500ml');
    await page.fill('[name=openingPacks]', '50'); await page.fill('[name=bottlesPerPack]', '12');
    ok('carton and crate are tucked into an optional section', !(await page.isVisible('[name=bottlesPerCarton]'))); await page.click('summary:has-text("carton or crate")');
    await page.fill('[name=bottlesPerCarton]', '48'); await page.fill('[name=bottlesPerCrate]', '24');
    await page.fill('[name=costPrice]', '40'); await page.fill('[name=retailPrice]', '45'); await page.fill('[name=wholesalePrice]', '43'); await page.fill('[name=lowStockAlert]', '60');
    const liveTxt = await page.textContent('.live-summary');
    ok('LIVE summary: 50 packs x 12 bottles = 600 bottles', liveTxt.includes('50 packs \u00d7 12 bottles = 600 bottles'), liveTxt.slice(0, 120));
    ok('LIVE summary: Rs. 45 per bottle -> Rs. 540 per pack', liveTxt.includes('Rs. 45.00 per bottle \u2192 Rs. 540.00 per pack'));
    ok('LIVE summary: wholesaler Rs. 43 -> Rs. 516 per pack; stock worth Rs. 24,000 at cost', liveTxt.includes('Rs. 516.00 per pack') && liveTxt.includes('Rs. 24,000.00'));
    await page.fill('[name=bottlesPerPack]', '24'); ok('LIVE summary updates instantly when bottles-per-pack changes', (await page.textContent('.live-summary')).includes('50 packs \u00d7 24 bottles = 1,200 bottles')); await page.fill('[name=bottlesPerPack]', '12');
    const prev = await page.textContent('.preview');
    ok('live preview computes pack/carton/crate prices from per-bottle price', ['Rs. 540.00', 'Rs. 2,160.00', 'Rs. 1,080.00', 'Rs. 516.00', 'Rs. 480.00'].every((x) => prev.includes(x)), prev.slice(0, 160));
    await shot('03c-product-form');
    await page.fill('[name=retailPrice]', '30'); ok('warns when retail price is below cost', (await page.textContent('.modal')).includes('below cost price')); await page.fill('[name=retailPrice]', '45');
    await page.click('.modal-foot .btn-primary'); await page.waitForSelector('.toast.ok:has-text("600 bottles")'); ok('product saved with 600 bottles opening stock', true);
    ok('list shows stock in bottles and mixed units, prices per bottle', await page.$eval('tr:has-text("Cola")', (r) => ['600 bottles', '12 cartons, 1 crate', 'Rs. 45.00', 'Rs. 43.00', 'Rs. 40.00', 'In stock'].every((t) => r.textContent.includes(t))));
    await page.click('.page-head >> text=Add product'); await page.waitForSelector('.modal.wide');
    await page.fill('[name=name]', 'Cola'); await page.fill('[name=brand]', 'coca-cola'); await page.fill('[name=size]', '500ML'); await page.fill('[name=retailPrice]', '45'); await page.fill('[name=wholesalePrice]', '43');
    await page.click('.modal-foot .btn-primary'); await page.waitForSelector('.form-error'); ok('duplicate product rejected', (await page.textContent('.form-error')).includes('already exists'));
    await page.fill('[name=name]', 'Mirinda'); await page.fill('[name=brand]', 'Pepsi'); await page.fill('[name=size]', '500ml'); await page.fill('[name=category]', 'Soft drinks');
    await page.fill('[name=openingPacks]', '4'); await page.fill('[name=bottlesPerPack]', '12'); await page.fill('[name=costPrice]', '38'); await page.fill('[name=retailPrice]', '43'); await page.fill('[name=wholesalePrice]', '41'); await page.fill('[name=lowStockAlert]', '60');
    await page.click('.modal-foot .btn-primary'); await page.waitForSelector('.toast.ok:has-text("48 bottles")'); await page.waitForSelector('tr:has-text("Mirinda")');
    ok('low-stock product is flagged', (await page.textContent('tr:has-text("Mirinda")')).includes('Low stock'));
    await page.click('tr:has-text("Cola") >> text=Adjust stock'); await page.waitForSelector('[name=mode]');
    await page.selectOption('[name=mode]', 'remove'); await page.selectOption('[name=unit]', 'pack'); await page.fill('[name=qty]', '1'); await page.fill('[name=note]', 'Staff use');
    ok('adjust dialog previews the new stock', (await page.textContent('.modal')).includes('Stock will become 588 bottles'));
    await page.fill('[name=qty]', '999'); ok('adjust dialog blocks going below zero (preview)', (await page.textContent('.modal')).includes('Not possible'));
    await page.click('.modal-foot .btn-primary'); await page.waitForSelector('.form-error'); ok('server also refuses negative stock', (await page.textContent('.form-error')).includes('Not enough stock'));
    await page.fill('[name=qty]', '1'); await page.click('.modal-foot .btn-primary'); await page.waitForSelector('.toast.ok:has-text("Stock is now")');
    ok('stock reduced by one pack (600 -> 588)', (await page.textContent('tr:has-text("Cola")')).includes('588 bottles'));
    await page.click('tr:has-text("Cola") >> text=History'); await page.waitForSelector('text=Stock movements');
    const hist = await page.textContent('.modal'); ok('history lists opening stock and the adjustment with reason', ['Opening stock', 'Adjustment', 'Staff use', '-12', '+600', '588'].every((t) => hist.includes(t)), hist.slice(0, 120));
    await shot('03d-product-history'); await page.click('.modal-foot .btn-primary');
    await page.fill('input[aria-label="Search products"]', 'pepsi'); await page.waitForTimeout(450);
    ok('product search filters the list', (await page.$$eval('.tbl tbody tr', (r) => r.length)) === 1); await page.fill('input[aria-label="Search products"]', ''); await page.waitForTimeout(450);
    await shot('03e-products');
    await page.click('.nav-item[data-id=dashboard]'); await page.waitForSelector('.lowrow');
    ok('dashboard low-stock card lists Mirinda', (await page.textContent('.lowrow')).includes('Mirinda'));
    ok('dashboard stock value = 588 x Rs.40 + 48 x Rs.38', (await page.textContent('.kpis')).includes('Rs. 25,344.00')); await shot('03f-dashboard-live');

    // ---- settings ----
    await page.click('.nav-item[data-id=settings]'); await page.waitForSelector('[name=business_phone]');
    ok('settings show the real business profile', (await page.inputValue('[name=business_phone]')) === '03421224370');
    await page.selectOption('[name=receipt_width]', '58'); await page.fill('[name=session_idle_minutes]', '0'); await page.click('text=Save settings');
    await page.waitForSelector('.form-error'); ok('invalid setting rejected', (await page.textContent('.form-error')).includes('Auto sign-out'));
    await page.selectOption('[name=date_format]', 'YYYY-MM-DD'); await page.fill('[name=session_idle_minutes]', '90'); await page.click('text=Save settings'); await page.waitForSelector('.toast.ok'); ok('valid settings saved', true);
    await page.waitForTimeout(1200); ok('changing the date format in Settings changes the clock date live', /\d{4}-\d{2}-\d{2}/.test(await page.textContent('.clock .d')), await page.textContent('.clock .d'));
    await shot('05-settings');

    // ---- users ----
    await page.click('.nav-item[data-id=users]'); await page.waitForSelector('.tbl');
    await page.click('text=Add user'); await page.fill('[name=displayName]', 'Ali Cashier'); await page.fill('[name=username]', 'ali'); await page.fill('[name=password]', 'temp1234');
    await shot('06-add-user'); await page.click('.modal-foot .btn-primary'); await page.waitForSelector('td:has-text("Ali Cashier")'); ok('cashier created', true);
    await page.click('.nav-item[data-id=users]');
    await shot('07-users');

    // ---- backup ----
    await page.click('.nav-item[data-id=backup]'); await page.waitForSelector('text=Keep a copy of your data');
    await page.click('text=Back up now'); await page.waitForSelector('td:has-text("Manual")'); ok('manual backup created and listed', true);
    await page.click('text=Check database integrity'); await page.waitForSelector('text=All checks passed'); ok('integrity check passes', true);
    ok('top bar now shows a recent backup', (await page.textContent('.topbar')).includes('Backed up just now')); await shot('08-backup');

    // ---- activity ----
    await page.click('.nav-item[data-id=activity]'); await page.waitForSelector('text=Everything that happened'); await page.waitForSelector('.tbl td');
    const actTxt = await page.textContent('.tbl'); ok('activity log lists setup, product, stock, settings, user and backup events', ['Owner account created', 'Product added', 'Stock adjusted', 'Settings changed', 'User added', 'Backup created'].every((t) => actTxt.includes(t)));
    await page.fill('input[placeholder="Search the log"]', 'backup'); await page.waitForTimeout(500);
    ok('activity search filters', (await page.$$eval('.tbl tbody tr', (r) => r.length)) <= 2); await shot('09-activity');

    // ---- sign out / wrong password / cashier ----
    await page.click('.user-btn'); await page.click('.menu >> text=Sign out'); await page.waitForSelector('.auth-card');
    ok('sign out returns to login', (await page.textContent('.auth-card h2')).includes('Welcome back')); await shot('10-login');
    await page.fill('[name=username]', 'ali'); await page.fill('[name=password]', 'wrong-one'); await page.click('button[type=submit]');
    await page.waitForSelector('.form-error'); ok('wrong password shows generic error', (await page.textContent('.form-error')).includes('Wrong username or password'));
    await page.fill('[name=password]', 'temp1234'); await page.click('button[type=submit]'); await page.waitForSelector('.modal');
    ok('temporary password forces a change before use', (await page.textContent('.modal')).includes('Choose your own'));
    ok('forced change cannot be dismissed with Escape', (await (async () => { await page.keyboard.press('Escape'); return page.$('.modal'); })()) !== null);
    await page.fill('[name=currentPassword]', 'temp1234'); await page.fill('[name=password]', 'ali-secret'); await page.fill('[name=confirm]', 'ali-secret'); await page.click('.modal-foot .btn-primary');
    await page.waitForSelector('.modal', { state: 'detached' });
    const navLabels = await page.$$eval('.nav-item', (b) => b.map((x) => x.dataset.id));
    ok('cashier sidebar hides admin screens', !['users', 'activity', 'backup', 'expenses', 'bank'].some((id) => navLabels.includes(id)), navLabels.join(','));
    ok('cashier still sees billing, customers, products, dashboard, settings', ['billing', 'customers', 'products', 'dashboard', 'settings'].every((id) => navLabels.includes(id)));
    await page.keyboard.press('F2'); await page.waitForSelector('.tbl');
    const heads = await page.$$eval('.tbl th', (t) => t.map((x) => x.textContent));
    ok('cashier sees products and prices but no cost column', heads.includes('Retailer / bottle') && !heads.some((x) => x.includes('Cost')));
    ok('cashier has no Add, Edit or Adjust buttons', (await page.$$eval('button', (b) => b.map((x) => x.textContent))).every((t) => !/Add product|^Edit$|Adjust stock/.test(t)));
    ok('cashier does not see cost prices anywhere in the product list', !(await page.textContent('.view')).includes('Rs. 40.00')); await shot('11a-cashier-products');
    await page.goto(base + '#/users'); await page.waitForSelector('.banner'); ok('cashier opening #/users is bounced to dashboard', true);
    await page.click('.nav-item[data-id=settings]'); await page.waitForSelector('[name=business_name]');
    ok('cashier sees settings read-only', await page.$eval('[name=business_name]', (i) => i.disabled)); await shot('11-cashier-settings');
    await page.setViewportSize({ width: 1100, height: 700 }); await page.click('.nav-item[data-id=dashboard]'); await page.waitForSelector('.banner'); await shot('12-narrow-1100');
  } catch (e) { ok('UI run completed without exceptions', false, e.message.split('\n')[0]); await shot('zz-failure').catch(() => {}); }
  ok('no console errors, page errors or failed requests', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close(); srv.kill();
  const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} UI checks passed. Screenshots: ${shots}`); process.exit(failed ? 1 : 0);
})();
