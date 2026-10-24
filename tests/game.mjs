import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + '/index.html');
const shots = '/tmp/jeopardy-shots';
mkdirSync(shots, { recursive: true });

const DOMAINS = ['Platform', 'Ingestion', 'Transformation', 'Lakeflow Jobs', 'CI/CD', 'Troubleshooting', 'Governance'];
const P1 = ['q', 'w', 'a', 's'];
const P2 = ['i', 'o', 'k', 'l'];
const KEY_LABELS = ['P1 Q', 'P2 I', 'P1 W', 'P2 O', 'P1 A', 'P2 K', 'P1 S', 'P2 L'];
const QUADS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function serve() {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launch() {
  const options = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  };
  try {
    return await chromium.launch({ ...options, channel: 'chrome' });
  } catch (err) {
    return chromium.launch({ ...options, executablePath: '/usr/bin/google-chrome' });
  }
}

function norm(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function idsOf(state) {
  return Object.values(state.deck).map(d => d.id).sort();
}

function disjoint(a, b) {
  const set = new Set(a);
  return b.filter(id => set.has(id));
}

async function main() {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const results = [];
  async function test(name, fn) {
    const before = errors.length;
    try {
      await fn();
      if (errors.length !== before) throw new Error('page errors: ' + errors.slice(before).join('\n'));
      results.push({ name, ok: true });
      console.log('PASS', name);
    } catch (err) {
      results.push({ name, ok: false, err: err && err.stack ? err.stack : String(err) });
      console.log('FAIL', name);
      console.log(err && err.stack ? err.stack : err);
    }
  }

  async function reset() {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#board .tile');
    await page.waitForFunction(() => {
      const raw = JSON.parse(localStorage.getItem('dbjeopardy') || 'null');
      return raw && raw.v === 3 && raw.deck && raw.deck.final && raw.dd && raw.dd.length === 2 && Array.isArray(raw.seen);
    });
  }

  async function game() {
    return page.evaluate(() => JSON.parse(localStorage.getItem('dbjeopardy')));
  }

  async function shot(name) {
    await page.screenshot({ path: shots + '/' + name + '.png' });
  }

  async function openTile(k) {
    await page.click(`.tile[data-k="${k}"]`);
    await page.waitForSelector('#modal.show');
  }

  async function newGame() {
    page.once('dialog', d => d.accept());
    await page.click('#newBtn');
    await page.waitForFunction(() => {
      const raw = JSON.parse(localStorage.getItem('dbjeopardy'));
      return raw.scores[0] === 0 && raw.scores[1] === 0 && raw.used.length === 0;
    });
  }

  async function keyLabels() {
    const texts = await page.locator('.opt .key').allTextContents();
    return texts.map(norm);
  }

  async function assertGrid() {
    const layout = await page.evaluate(() => {
      const grid = getComputedStyle(document.getElementById('mopts'));
      const items = [...document.querySelectorAll('#mopts .opt')].map(el => {
        const r = el.getBoundingClientRect();
        return {
          i: el.dataset.i,
          pos: el.dataset.pos,
          place: el.querySelector('.pos').textContent,
          letter: el.querySelector('.ltr').textContent,
          x: r.x,
          y: r.y
        };
      });
      return { display: grid.display, cols: grid.gridTemplateColumns, items };
    });
    assert.equal(layout.display, 'grid');
    assert.equal(layout.cols.trim().split(/\s+/).length, 2, layout.cols);
    const by = Object.fromEntries(layout.items.map(item => [item.i, item]));
    assert.deepEqual(layout.items.map(item => item.pos), QUADS);
    assert.deepEqual(layout.items.map(item => item.letter), ['A', 'B', 'C', 'D']);
    assert.deepEqual(layout.items.map(item => item.place), ['Top left', 'Top right', 'Bottom left', 'Bottom right']);
    assert.ok(by['0'].x < by['1'].x && by['2'].x < by['3'].x, 'columns swapped');
    assert.ok(by['0'].y < by['2'].y && by['1'].y < by['3'].y, 'rows swapped');
    assert.ok(Math.abs(by['0'].y - by['1'].y) < 12, 'top row not aligned');
    assert.ok(Math.abs(by['2'].y - by['3'].y) < 12, 'bottom row not aligned');
  }

  await test('board shows 7 exam categories, 35 values, and two daily doubles off the 200 row', async () => {
    await reset();
    const cats = await page.locator('.cat').allTextContents();
    assert.deepEqual(cats, DOMAINS);
    const tiles = await page.locator('.tile').allTextContents();
    assert.equal(tiles.length, 35);
    [200, 400, 600, 800, 1000].forEach((v, r) => {
      assert.deepEqual(tiles.slice(r * 7, r * 7 + 7), Array(7).fill('$' + v));
    });
    assert.equal(await page.locator('#s0').textContent(), '$0');
    assert.equal(await page.locator('#s1').textContent(), '$0');
    assert.equal(await page.locator('#p0 .keys').textContent(), 'Q W / A S');
    assert.equal(await page.locator('#p1 .keys').textContent(), 'I O / K L');
    assert.equal(await page.locator('.buzz').count(), 0);
    const help = await page.locator('#help').textContent();
    assert.match(help, /Q W \/ A S/);
    assert.match(help, /I O \/ K L/);
    assert.match(help, /Esc/);
    assert.match(help, /F fullscreen/);
    assert.match(help, /M mute/);
    assert.doesNotMatch(help, /1 2 3 4/);
    assert.doesNotMatch(help, /7 8 9 0/);
    assert.doesNotMatch(help, /buzz/i);
    const s = await game();
    assert.equal(new Set(s.dd).size, 2);
    assert.ok(s.dd.every(k => !k.endsWith('-0')));
    const fit = await page.evaluate(() => {
      const scores = document.getElementById('scores').getBoundingClientRect();
      const header = document.querySelector('header').getBoundingClientRect();
      return { bottom: scores.bottom, top: header.top, ih: window.innerHeight };
    });
    assert.ok(fit.top >= -1, 'header clipped');
    assert.ok(fit.bottom <= fit.ih + 1, 'scores clipped ' + fit.bottom + ' > ' + fit.ih);
    await shot('01-board');
  });

  await test('every clue has 4 options, one correct index, and an official domain', async () => {
    await reset();
    const pack = await page.evaluate(() => window.__PACK);
    assert.deepEqual(pack.domains, DOMAINS);
    assert.deepEqual(pack.names, DOMAINS);
    assert.deepEqual(pack.keys.p1, ['Q', 'W', 'A', 'S']);
    assert.deepEqual(pack.keys.p2, ['I', 'O', 'K', 'L']);
    assert.deepEqual(pack.keys.letters, ['A', 'B', 'C', 'D']);
    assert.deepEqual(pack.keys.positions, QUADS);
    assert.equal(pack.clues.length, 7);
    const byId = new Map();
    pack.clues.forEach((pools, c) => {
      assert.equal(pools.length, 5, pack.names[c]);
      pools.forEach((pool, r) => {
        assert.equal(pool.length, 4, pack.names[c] + ' $' + [200, 400, 600, 800, 1000][r]);
        pool.forEach(clue => {
          assert.ok(DOMAINS.includes(clue.domain), clue.id);
          assert.equal(clue.domain, pack.names[c], clue.id);
          assert.equal(new Set([clue.a, ...clue.wrong]).size, 4, clue.q);
          clue.wrong.forEach(w => assert.ok(w && w !== clue.a));
          assert.ok(!byId.has(clue.id), 'duplicate ' + clue.id);
          byId.set(clue.id, clue);
        });
      });
    });
    assert.equal(pack.finals.length, 4);
    pack.finals.forEach(clue => {
      assert.ok(DOMAINS.includes(clue.domain), clue.id);
      assert.equal(new Set([clue.a, ...clue.wrong]).size, 4, clue.id);
      assert.ok(!byId.has(clue.id), 'duplicate ' + clue.id);
      byId.set(clue.id, clue);
    });
    const expectClue = [...byId.values()].find(c => c.a === 'What are expectations?');
    assert.ok(expectClue, 'expectations clue missing');
    assert.equal(expectClue.domain, 'Transformation');
    assert.match(expectClue.code, /CREATE OR REFRESH STREAMING TABLE orders_clean/);
    assert.match(expectClue.code, /CONSTRAINT valid_id EXPECT \(id IS NOT NULL\) ON VIOLATION DROP ROW/);
    assert.match(expectClue.code, /FROM STREAM\(orders_raw\)/);
    assert.equal(expectClue.wrong.length, 3);
    const s = await game();
    Object.values(s.deck).forEach(d => {
      const clue = byId.get(d.id);
      assert.ok(clue, d.id);
      assert.equal(d.options.length, 4);
      assert.ok(Number.isInteger(d.correct) && d.correct >= 0 && d.correct <= 3);
      assert.equal(d.options[d.correct], clue.a);
      assert.deepEqual([...d.options].sort(), [clue.a, ...clue.wrong].sort());
      assert.equal(d.domain, clue.domain);
      assert.ok(DOMAINS.includes(d.domain));
    });
    const indexes = Object.values(s.deck).map(d => d.correct);
    assert.ok(indexes.some(i => i !== 0), 'options were not shuffled');
    assert.ok(indexes.some(i => i !== indexes[0]), 'every clue got the same slot');
    assert.equal(new Set(idsOf(s)).size, 36);
  });

  await test('first player key locks the answer; number keys do not', async () => {
    await reset();
    const k = '0-0';
    const s = await game();
    const correct = s.deck[k].correct;
    await openTile(k);
    await shot('02-clue');
    const letters = await page.locator('.opt .ltr').allTextContents();
    assert.deepEqual(letters, ['A', 'B', 'C', 'D']);
    assert.deepEqual(await keyLabels(), KEY_LABELS);
    assert.equal(await page.locator('#mdomain').textContent(), s.deck[k].domain);
    assert.equal(await page.locator('#mdomain').isVisible(), true);
    assert.deepEqual(await page.locator('.opt .txt').allTextContents(), s.deck[k].options);
    await page.keyboard.press('1');
    await page.keyboard.press('4');
    await page.keyboard.press('7');
    await page.keyboard.press('0');
    assert.equal((await game()).scores[0], 0);
    assert.equal((await game()).scores[1], 0);
    assert.ok(!(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class')).includes('right'));
    await page.keyboard.press(P1[correct]);
    assert.equal((await game()).scores[0], 200);
    assert.equal((await game()).scores[1], 0);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    const status = await page.locator('#mstatus').textContent();
    assert.match(status, /correct/i);
    assert.match(status, new RegExp(s.deck[k].domain));
    assert.equal(await page.locator('#mdomain').textContent(), s.deck[k].domain);
    await shot('03-correct');
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));
    assert.match(await page.locator(`.tile[data-k="${k}"]`).getAttribute('class'), /used/);
    await page.click(`.tile[data-k="${k}"]`);
    assert.equal(await page.locator('#modal.show').count(), 0);
  });

  await test('player 2 can win the race with i o k l', async () => {
    await reset();
    const k = '1-1';
    const correct = (await game()).deck[k].correct;
    await openTile(k);
    await page.keyboard.press(P2[correct]);
    assert.equal((await game()).scores[0], 0);
    assert.equal((await game()).scores[1], 400);
    assert.match(await page.locator('#mstatus').textContent(), /Player 2/);
    assert.match(await page.locator('#p1').getAttribute('class'), /lock/);
  });

  await test('a wrong pick subtracts and only the other player can steal', async () => {
    await reset();
    const k = '1-0';
    const correct = (await game()).deck[k].correct;
    const wrong = [0, 1, 2, 3].find(i => i !== correct);
    await openTile(k);
    await page.keyboard.press(P1[wrong]);
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], 0);
    assert.match(await page.locator(`.opt[data-i="${wrong}"]`).getAttribute('class'), /wrong/);
    assert.equal(await page.locator(`.opt[data-i="${wrong}"] .key`).first().isDisabled(), true);
    assert.ok(!(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class')).includes('right'));
    assert.match(await page.locator('#mstatus').textContent(), /may steal/i);
    await shot('04-wrong-steal');
    await page.keyboard.press(P1[correct]);
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], 0);
    await page.keyboard.press(P2[wrong]);
    assert.equal((await game()).scores[1], 0);
    await page.keyboard.press(P2[correct]);
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], 200);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    assert.match(await page.locator('#mstatus').textContent(), /Transformation|Ingestion|Platform|Governance|CI\/CD|Troubleshooting|Lakeflow Jobs/);
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));
  });

  await test('both players wrong reveals the correct answer and the domain', async () => {
    await reset();
    const k = '2-0';
    const deck = (await game()).deck[k];
    const wrongs = [0, 1, 2, 3].filter(i => i !== deck.correct);
    await openTile(k);
    await page.keyboard.press(P1[wrongs[0]]);
    await page.keyboard.press(P2[wrongs[1]]);
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], -200);
    assert.match(await page.locator(`.opt[data-i="${deck.correct}"]`).getAttribute('class'), /right/);
    const status = await page.locator('#mstatus').textContent();
    assert.match(status, new RegExp(deck.options[deck.correct].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(status, new RegExp(deck.domain));
    assert.equal(await page.locator('#mdomain').textContent(), deck.domain);
    await page.keyboard.press(P2[deck.correct]);
    await page.keyboard.press(P1[deck.correct]);
    assert.equal((await game()).scores[1], -200);
    assert.equal(await page.locator('#modal.show').count(), 1);
  });

  await test('daily double only accepts the selecting player keys and has no steal', async () => {
    await reset();
    const s = await game();
    const k = s.dd[0];
    await openTile(k);
    assert.match(await page.locator('#mclue').textContent(), /DAILY DOUBLE/);
    assert.equal(await page.locator('#mdomain').isVisible(), true);
    await shot('05-daily-double');
    await page.keyboard.press('1');
    await page.keyboard.press('q');
    await page.keyboard.press('i');
    assert.match(await page.locator('#mclue').textContent(), /DAILY DOUBLE/);
    assert.equal((await game()).scores[0], 0);
    await page.click('#who0');
    await page.fill('#wager', '250');
    await page.click('#ddGo');
    const correct = (await game()).deck[k].correct;
    assert.equal(await page.locator('.opt').count(), 4);
    assert.deepEqual(await keyLabels(), KEY_LABELS);
    assert.match(await page.locator('#mstatus').textContent(), /\$250/);
    await page.keyboard.press(P2[correct]);
    assert.equal((await game()).scores[0], 0);
    assert.equal((await game()).scores[1], 0);
    await page.keyboard.press(P1[correct]);
    assert.equal((await game()).scores[0], 250);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    assert.equal(await page.locator('#mdomain').textContent(), (await game()).deck[k].domain);
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));

    const k2 = (await game()).dd[1];
    await openTile(k2);
    await page.click('#who1');
    await page.fill('#wager', '700');
    await page.keyboard.press('Enter');
    const correct2 = (await game()).deck[k2].correct;
    const wrong2 = [0, 1, 2, 3].find(i => i !== correct2);
    await page.keyboard.press(P1[wrong2]);
    assert.equal((await game()).scores[1], 0);
    await page.keyboard.press(P2[wrong2]);
    assert.equal((await game()).scores[0], 250);
    assert.equal((await game()).scores[1], -700);
    assert.match(await page.locator(`.opt[data-i="${correct2}"]`).getAttribute('class'), /right/);
    const status = await page.locator('#mstatus').textContent();
    assert.match(status, /wrong/i);
    assert.doesNotMatch(status, /may steal/i);
    assert.match(status, new RegExp((await game()).deck[k2].domain));
    await page.keyboard.press(P2[correct2]);
    assert.equal((await game()).scores[1], -700);
  });

  await test('final jeopardy locks each player with their own keys', async () => {
    await reset();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('dbjeopardy'));
      s.scores = [1000, 600];
      localStorage.setItem('dbjeopardy', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#s0');
    assert.equal(await page.locator('#s0').textContent(), '$1000');
    const final = (await game()).deck.final;
    const correct = final.correct;
    const answer = final.options[correct];
    const wrong = [0, 1, 2, 3].find(i => i !== correct);
    await page.click('#finalBtn');
    await page.waitForSelector('#fw0');
    assert.equal(await page.locator('#mdomain').textContent(), final.domain);
    const security = await page.locator('#fw0').evaluate(el => getComputedStyle(el).webkitTextSecurity);
    assert.equal(security, 'disc');
    await page.fill('#fw0', '99999');
    await page.fill('#fw1', '100');
    await page.click('#showClue');
    await page.waitForSelector('.opt');
    assert.equal(await page.locator('#mopts').innerText().then(t => t.includes(answer)), true);
    assert.deepEqual(await keyLabels(), KEY_LABELS);
    await page.keyboard.press(P2[correct]);
    assert.equal(await page.locator('#p2go').count(), 0);
    await page.keyboard.press(P1[correct]);
    await page.waitForSelector('#p2go');
    assert.equal(await page.locator('.opt').count(), 0);
    const handoff = await page.locator('#modal').innerText();
    assert.ok(!handoff.includes(answer), 'player 1 pick leaked: ' + handoff);
    await page.keyboard.press(P2[wrong]);
    assert.equal(await page.locator('#p2go').count(), 1);
    await page.click('#p2go');
    await page.waitForSelector('.opt');
    await page.keyboard.press(P1[wrong]);
    assert.equal(await page.locator('.opt.right').count(), 0);
    await page.locator(`.opt[data-i="${wrong}"] .key.p2`).click();
    await page.waitForSelector('.opt.right');
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    assert.match(await page.locator(`.opt[data-i="${wrong}"]`).getAttribute('class'), /wrong/);
    const status = await page.locator('#mstatus').textContent();
    assert.match(status, /correct/i);
    assert.match(status, /wrong/i);
    assert.match(status, new RegExp(final.domain));
    assert.equal(await page.locator('#mdomain').textContent(), final.domain);
    assert.equal(await page.locator('#s0').textContent(), '$2000');
    assert.equal(await page.locator('#s1').textContent(), '$500');
    await shot('06-final-reveal');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal.show').count(), 0);
    assert.equal(await page.locator('#s0').textContent(), '$2000');
    assert.equal(await page.locator('#s1').textContent(), '$500');
  });

  await test('expectations clue renders SQL in a monospace block with its domain', async () => {
    await reset();
    const pack = await page.evaluate(() => window.__PACK);
    const clue = pack.clues.flat(2).find(c => c.a === 'What are expectations?');
    assert.ok(clue);
    const k = '2-0';
    await page.evaluate(({ k, clue }) => {
      window.__debug.forceSlot(k, {
        id: clue.id,
        domain: clue.domain,
        q: clue.q,
        code: clue.code,
        options: [clue.a, ...clue.wrong],
        correct: 0
      });
    }, { k, clue });
    await openTile(k);
    const code = await page.locator('#mclue .code').innerText();
    assert.match(code, /CREATE OR REFRESH STREAMING TABLE orders_clean/);
    assert.match(code, /CONSTRAINT valid_id EXPECT \(id IS NOT NULL\) ON VIOLATION DROP ROW/);
    assert.match(code, /STREAM\(orders_raw\)/);
    const font = await page.locator('#mclue .code').evaluate(el => getComputedStyle(el).fontFamily);
    const transform = await page.locator('#mclue .code').evaluate(el => getComputedStyle(el).textTransform);
    assert.match(font, /mono|consolas|courier/i);
    assert.notEqual(transform, 'uppercase');
    assert.equal(await page.locator('#mdomain').textContent(), 'Transformation');
    assert.deepEqual(await page.locator('.opt .txt').allTextContents(), [clue.a, ...clue.wrong]);
    assert.deepEqual(await keyLabels(), KEY_LABELS);
    const overflow = await page.evaluate(() => {
      const m = document.getElementById('modal');
      return m.scrollHeight - m.clientHeight;
    });
    assert.ok(overflow <= 1, 'expectations modal overflow ' + overflow);
    await shot('07-expectations');
    await page.keyboard.press('q');
    assert.match(await page.locator('#mstatus').textContent(), /Transformation/);
    assert.match(await page.locator('#mstatus').textContent(), /correct/i);
    assert.equal(await page.locator('#mdomain').textContent(), 'Transformation');
    assert.match(await page.locator('.opt.right .txt').textContent(), /What are expectations\?/);
  });

  await test('every dealt clue fits, shows the domain, and maps keys for every option', async () => {
    await reset();
    let worst = 0;
    let worstKey = '';
    const s = await game();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        const k = c + '-' + r;
        await openTile(k);
        assert.equal(await page.locator('#mdomain').textContent(), s.deck[k].domain, k);
        assert.ok(DOMAINS.includes(s.deck[k].domain), k);
        if ((await page.locator('#mclue').textContent()).includes('DAILY DOUBLE')) {
          await page.click('#who0');
          await page.click('#ddGo');
        }
        await page.waitForSelector('.opt');
        const opts = await page.locator('.opt .txt').allTextContents();
        assert.equal(opts.length, 4, k);
        assert.equal(new Set(opts).size, 4, k);
        assert.deepEqual(opts, s.deck[k].options);
        assert.deepEqual(await page.locator('.opt .ltr').allTextContents(), ['A', 'B', 'C', 'D']);
        assert.deepEqual(await keyLabels(), KEY_LABELS, k);
        await assertGrid();
        assert.equal(s.deck[k].options[s.deck[k].correct] === s.deck[k].options[s.deck[k].correct], true);
        assert.ok(s.deck[k].correct >= 0 && s.deck[k].correct <= 3, k);
        const overflow = await page.evaluate(() => {
          const m = document.getElementById('modal');
          return m.scrollHeight - m.clientHeight;
        });
        if (overflow > worst) { worst = overflow; worstKey = k; }
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));
      }
    }
    assert.ok(worst <= 1, 'modal overflow ' + worst + 'px on ' + worstKey);
  });

  await test('names persist, and new games skip clues until the pool is exhausted', async () => {
    await reset();
    await page.locator('#p0 input').fill('Ada');
    await page.locator('#p0 input').evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));
    await page.locator('#p1 .adj button').nth(0).click();
    const before = await game();
    assert.equal(before.names[0], 'Ada');
    assert.equal(before.scores[1], -200);
    const first = idsOf(before);
    assert.equal(new Set(first).size, 36);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#s1');
    const after = await game();
    assert.equal(await page.locator('#p0 input').inputValue(), 'Ada');
    assert.equal(await page.locator('#s1').textContent(), '-$200');
    assert.match(await page.locator('#s1').getAttribute('class'), /neg/);
    assert.deepEqual(after.deck, before.deck);
    assert.deepEqual(after.dd, before.dd);
    assert.deepEqual(after.seen, before.seen);
    await newGame();
    const secondState = await game();
    const second = idsOf(secondState);
    assert.equal(secondState.names[0], 'Ada');
    assert.equal(await page.locator('#s1').textContent(), '$0');
    assert.equal(disjoint(first, second).length, 0, 'game 2 repeated a clue');
    assert.ok(first.every(id => secondState.seen.includes(id)));
    assert.ok(second.every(id => secondState.seen.includes(id)));
    await newGame();
    const third = idsOf(await game());
    assert.equal(disjoint(first, third).length, 0, 'game 3 repeated game 1');
    assert.equal(disjoint(second, third).length, 0, 'game 3 repeated game 2');

    const allIds = await page.evaluate(() => {
      const pack = window.__PACK;
      return pack.clues.flat(2).map(c => c.id).concat(pack.finals.map(c => c.id));
    });
    assert.equal(allIds.length, 7 * 5 * 4 + 4);
    await page.evaluate(ids => window.__debug.setSeen(ids), allIds);
    await newGame();
    const reused = await game();
    const reusedIds = idsOf(reused);
    assert.equal(reusedIds.length, 36);
    assert.equal(new Set(reusedIds).size, 36);
    assert.equal(disjoint(reusedIds, allIds).length, 36);
    assert.equal(reused.seen.length, 36);
    reusedIds.forEach(id => assert.ok(reused.seen.includes(id)));
  });

  await test('quadrants match the keys, the A key is answer C, and modifiers do not answer', async () => {
    await reset();
    const k = '4-0';
    await openTile(k);
    await assertGrid();
    await shot('08-quadrant');
    assert.match(await page.locator('#mlegend').textContent(), /P1 A is bottom-left \(answer C\)/);
    await page.keyboard.press('Control+q');
    await page.keyboard.press('Meta+l');
    await page.keyboard.press('Alt+s');
    assert.equal((await game()).scores[0], 0);
    assert.equal((await game()).scores[1], 0);
    assert.equal(await page.locator('.opt.wrong, .opt.right').count(), 0);
    const before = (await game()).scores[0];
    await page.keyboard.press('a');
    const correct = (await game()).deck[k].correct;
    const marked = await page.locator('.opt[data-i="2"]').getAttribute('class');
    if (correct === 2) {
      assert.match(marked, /right/);
      assert.equal((await game()).scores[0], before + 200);
    } else {
      assert.match(marked, /wrong/);
      assert.equal((await game()).scores[0], before - 200);
      assert.ok(!/right|wrong/.test(await page.locator('.opt[data-i="0"]').getAttribute('class') || ''));
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));

    const k2 = '5-0';
    await openTile(k2);
    const before2 = (await game()).scores[0];
    await page.keyboard.press('Q');
    const correct2 = (await game()).deck[k2].correct;
    const marked2 = await page.locator('.opt[data-i="0"]').getAttribute('class');
    if (correct2 === 0) {
      assert.match(marked2, /right/);
      assert.equal((await game()).scores[0], before2 + 200);
    } else {
      assert.match(marked2, /wrong/);
      assert.equal((await game()).scores[0], before2 - 200);
      assert.ok(!/right|wrong/.test(await page.locator('.opt[data-i="2"]').getAttribute('class') || ''));
    }
  });

  await test('mute and fullscreen keys do not break the board', async () => {
    await reset();
    await page.keyboard.press('m');
    assert.equal(await page.locator('#muteBtn').textContent(), 'Unmute');
    await page.click('#muteBtn');
    assert.equal(await page.locator('#muteBtn').textContent(), 'Mute');
    await page.keyboard.press('f');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.tile').count(), 35);
    assert.equal(await page.locator('.cat').count(), 7);
  });

  const failed = results.filter(r => !r.ok);
  console.log('\n' + results.filter(r => r.ok).length + ' passed, ' + failed.length + ' failed');
  await browser.close();
  server.close();
  if (failed.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
