// Reproduce the buy-menu flow with real DOM clicks. Dev-only.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'freeze', null, { timeout: 20000 });
await page.waitForTimeout(400);

const snap = async (label) => {
  const s = await page.evaluate(() => {
    const g = window.__game, hud = g.hud;
    const el = document.querySelector('.buy-menu');
    const r = el ? el.getBoundingClientRect() : null;
    return {
      state: g.state, buyOpen: hud.buyOpen,
      hidden: el ? el.classList.contains('hidden') : 'no-el',
      rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      money: g.human.money, charges: { ...g.human.charges }, wand: g.human.wand.id,
      cards: [...document.querySelectorAll('.buy-card .card-name')].slice(0, 12).map((n) => n.textContent),
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

await snap('initial:');

// hit-test the center of the menu: what element actually receives the click?
const hit = await page.evaluate(() => {
  const el = document.querySelector('.buy-menu');
  const r = el.getBoundingClientRect();
  const t = document.elementFromPoint(r.left + r.width / 2, r.top + 60);
  return t ? `${t.tagName}.${t.className}` : 'none';
});
console.log('elementFromPoint over menu head:', hit);

// click the Spells tab, then the Bombarda card
await page.click('.buy-tab:nth-child(2)');
await page.waitForTimeout(150);
const before = await page.evaluate(() => window.__game.human.money);
const clicked = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.buy-card')];
  const c = cards.find((x) => x.querySelector('.card-name')?.textContent === 'Bombarda');
  if (!c) return 'card not found';
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (typeof clicked === 'object') await page.mouse.click(clicked.x, clicked.y);
await page.waitForTimeout(200);
const after = await snap('after bombarda click:');
console.log('money delta:', before, '->', after.money);

// keyboard toggle
await page.keyboard.press('b');
await page.waitForTimeout(150);
await snap('after B (close):');
await page.keyboard.press('b');
await page.waitForTimeout(150);
await snap('after B (reopen):');

await page.screenshot({ path: 'shots/debug-buy.png' });
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
