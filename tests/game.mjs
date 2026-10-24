import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + '/index.html');
const shots = '/tmp/jeopardy-shots';
mkdirSync(shots, { recursive: true });

const SPOT = [
  ['Delta Lake stores table data files in this open-source columnar format', 'Parquet'],
  ["The Delta transaction log lives in this subdirectory of the table's location", '_delta_log'],
  ['This DataFrame method reduces the number of partitions while avoiding a full shuffle', 'coalesce()'],
  ['This Spark SQL optimizer turns DataFrame and SQL queries into optimized execution plans', 'Catalyst'],
  ['Operations like groupBy or join that require a shuffle of data across partitions are this type of transformation', 'Wide transformation'],
  ['Using VERSION AS OF or TIMESTAMP AS OF to query an older table snapshot is called this', 'Time travel'],
  ['This command deletes data files no longer referenced by the table, with a default retention threshold of 7 days', 'VACUUM'],
  ['This SQL command gives a privilege such as SELECT on a table to a user or group', 'GRANT'],
  ['This Unity Catalog object combines a storage credential with a cloud storage path', 'External location'],
  ['This compute resource runs SQL queries in Databricks SQL, available in serverless, pro and classic types', 'SQL warehouse'],
  ['Known by its 4-letter acronym, this statement creates a table and fills it from a query in one step', 'CTAS (CREATE TABLE AS SELECT)'],
  ['In the medallion architecture, raw ingested data lands in this layer', 'Bronze'],
  ['This medallion layer holds business-level aggregates ready for reporting', 'Gold'],
  ['Auto Loader is invoked with this value passed to spark.readStream.format()', 'cloudFiles'],
  ['In Lakeflow pipelines (formerly Delta Live Tables), these SQL boolean checks on each record can warn, drop the row, or fail the update', 'Expectations'],
  ['This Structured Streaming option sets where progress info is stored so a query can recover after failure', 'checkpointLocation'],
  ['Formerly called Repos, this feature syncs workspace code with a Git provider', 'Git folders'],
  ['Unlike all-purpose compute, this classic compute type starts for a job run and terminates automatically when the run completes', 'Jobs compute (a job cluster)'],
  ['Developed by Databricks, this open protocol shares live Delta Lake and Parquet data across platforms without copying it', 'Delta Sharing (OpenSharing)']
];

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
      return raw && raw.deck && raw.deck.final && raw.dd && raw.dd.length === 2;
    });
  }

  async function game() {
    return page.evaluate(() => JSON.parse(localStorage.getItem('dbjeopardy')));
  }

  async function shot(name) {
    await page.screenshot({ path: shots + '/' + name + '.png' });
  }

  function rowValue(k) {
    return [200, 400, 600, 800, 1000][+k.split('-')[1]];
  }

  async function openTile(k) {
    await page.click(`.tile[data-k="${k}"]`);
    await page.waitForSelector('#modal.show');
  }

  await test('board shows 6 categories, 30 values, and two daily doubles off the 200 row', async () => {
    await reset();
    const cats = await page.locator('.cat').allTextContents();
    assert.deepEqual(cats, [
      'Spark', 'Delta Lake', 'Unity Catalog', 'Databricks SQL',
      'Data Engineering / ETL', 'Lakehouse & Workflows'
    ]);
    const tiles = await page.locator('.tile').allTextContents();
    assert.equal(tiles.length, 30);
    [200, 400, 600, 800, 1000].forEach((v, r) => {
      assert.deepEqual(tiles.slice(r * 6, r * 6 + 6), Array(6).fill('$' + v));
    });
    assert.equal(await page.locator('#s0').textContent(), '$0');
    assert.equal(await page.locator('#s1').textContent(), '$0');
    const help = await page.locator('#help').textContent();
    assert.match(help, /1-4/);
    assert.match(help, /A/);
    assert.match(help, /L/);
    assert.doesNotMatch(help, /Space reveal/);
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

  await test('answer key has 4 unique options and the documented correct answer', async () => {
    await reset();
    const pack = await page.evaluate(() => window.__PACK);
    assert.deepEqual(pack.names, [
      'Spark', 'Delta Lake', 'Unity Catalog', 'Databricks SQL',
      'Data Engineering / ETL', 'Lakehouse & Workflows'
    ]);
    assert.equal(pack.clues.length, 6);
    const byQ = new Map();
    pack.clues.forEach(clues => {
      assert.equal(clues.length, 5);
      clues.forEach(clue => {
        assert.equal(new Set([clue.a, ...clue.wrong]).size, 4, clue.q);
        clue.wrong.forEach(w => assert.ok(w && w !== clue.a));
        byQ.set(clue.q, clue.a);
      });
    });
    SPOT.forEach(([q, a]) => assert.equal(byQ.get(q), a, q));
    assert.equal(new Set([pack.final.a, ...pack.final.wrong]).size, 4);
    assert.equal(pack.final.a, 'Schema enforcement');
    const s = await game();
    pack.clues.forEach((clues, c) => {
      clues.forEach((clue, r) => {
        const d = s.deck[c + '-' + r];
        assert.deepEqual([...d.options].sort(), [clue.a, ...clue.wrong].sort());
        assert.equal(d.options[d.correct], clue.a);
      });
    });
    assert.equal(s.deck.final.options[s.deck.final.correct], pack.final.a);
    const indexes = Object.values(s.deck).map(d => d.correct);
    assert.ok(indexes.some(i => i !== 0), 'options were not shuffled');
    assert.ok(indexes.some(i => i !== indexes[0]), 'every clue got the same slot');
  });

  await test('buzz then a correct 1-4 pick adds the value and highlights the answer', async () => {
    await reset();
    const k = '0-0';
    const s = await game();
    const correct = s.deck[k].correct;
    await openTile(k);
    await shot('02-clue');
    const letters = await page.locator('.opt .ltr').allTextContents();
    const keys = await page.locator('.opt .key').allTextContents();
    assert.deepEqual(letters, ['A', 'B', 'C', 'D']);
    assert.deepEqual(keys, ['1', '2', '3', '4']);
    assert.deepEqual(await page.locator('.opt .txt').allTextContents(), s.deck[k].options);
    await page.keyboard.press('1');
    assert.equal((await game()).scores[0], 0);
    assert.ok(!(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class')).includes('right'));
    await page.keyboard.press('a');
    assert.match(await page.locator('#mstatus').textContent(), /Player 1/);
    assert.match(await page.locator('#p0').getAttribute('class'), /lock/);
    await page.keyboard.press(String(correct + 1));
    assert.equal((await game()).scores[0], 200);
    assert.equal((await game()).scores[1], 0);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    assert.match(await page.locator('#mstatus').textContent(), /correct/i);
    await shot('03-correct');
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));
    assert.match(await page.locator(`.tile[data-k="${k}"]`).getAttribute('class'), /used/);
    await page.click(`.tile[data-k="${k}"]`);
    assert.equal(await page.locator('#modal.show').count(), 0);
  });

  await test('a wrong pick subtracts, hides the key, and lets the other player steal', async () => {
    await reset();
    const k = '1-0';
    const correct = (await game()).deck[k].correct;
    const wrong = [0, 1, 2, 3].find(i => i !== correct);
    await openTile(k);
    await page.keyboard.press('a');
    await page.locator(`.opt[data-i="${wrong}"]`).click();
    await page.keyboard.press(String(wrong + 1));
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], 0);
    assert.match(await page.locator(`.opt[data-i="${wrong}"]`).getAttribute('class'), /wrong/);
    assert.equal(await page.locator(`.opt[data-i="${wrong}"]`).isDisabled(), true);
    assert.ok(!(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class')).includes('right'));
    assert.match(await page.locator('#mstatus').textContent(), /may buzz/i);
    await shot('04-wrong-steal');
    await page.keyboard.press('a');
    assert.equal((await game()).scores[0], -200);
    assert.ok(!(await page.locator('#p0').getAttribute('class') || '').includes('lock'));
    await page.keyboard.press('l');
    assert.match(await page.locator('#mstatus').textContent(), /Player 2/);
    await page.keyboard.press(String(wrong + 1));
    assert.equal((await game()).scores[1], 0);
    await page.keyboard.press(String(correct + 1));
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], 200);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));
  });

  await test('both players wrong reveals the correct answer and stops the clue', async () => {
    await reset();
    const k = '2-0';
    const correct = (await game()).deck[k].correct;
    const wrongs = [0, 1, 2, 3].filter(i => i !== correct);
    await openTile(k);
    await page.click('#buzz0');
    await page.locator(`.opt[data-i="${wrongs[0]}"]`).click();
    await page.click('#buzz1');
    await page.locator(`.opt[data-i="${wrongs[1]}"]`).click();
    assert.equal((await game()).scores[0], -200);
    assert.equal((await game()).scores[1], -200);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    assert.match(await page.locator('#mstatus').textContent(), new RegExp(correctText(await game(), k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(await page.locator('#buzz0').count(), 0);
    assert.equal(await page.locator('#buzz1').count(), 0);
    await page.keyboard.press('l');
    await page.keyboard.press(String(correct + 1));
    assert.equal((await game()).scores[1], -200);
    assert.equal(await page.locator('#modal.show').count(), 1);
  });

  await test('daily double wagers then picks, with no steal on a miss', async () => {
    await reset();
    const s = await game();
    const k = s.dd[0];
    await openTile(k);
    assert.match(await page.locator('#mclue').textContent(), /DAILY DOUBLE/);
    await shot('05-daily-double');
    await page.keyboard.press('a');
    await page.keyboard.press('1');
    assert.match(await page.locator('#mclue').textContent(), /DAILY DOUBLE/);
    assert.equal((await game()).scores[0], 0);
    await page.click('#who0');
    await page.fill('#wager', '250');
    await page.click('#ddGo');
    const correct = (await game()).deck[k].correct;
    assert.equal(await page.locator('.opt').count(), 4);
    assert.match(await page.locator('#mstatus').textContent(), /\$250/);
    await page.keyboard.press(String(correct + 1));
    assert.equal((await game()).scores[0], 250);
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    await page.waitForFunction(() => !document.getElementById('modal').classList.contains('show'));

    const k2 = (await game()).dd[1];
    await openTile(k2);
    await page.click('#who1');
    await page.fill('#wager', '700');
    await page.keyboard.press('Enter');
    const correct2 = (await game()).deck[k2].correct;
    const wrong2 = [0, 1, 2, 3].find(i => i !== correct2);
    await page.keyboard.press(String(wrong2 + 1));
    assert.equal((await game()).scores[0], 250);
    assert.equal((await game()).scores[1], -700);
    assert.match(await page.locator(`.opt[data-i="${correct2}"]`).getAttribute('class'), /right/);
    assert.match(await page.locator('#mstatus').textContent(), /wrong/i);
    assert.doesNotMatch(await page.locator('#mstatus').textContent(), /may buzz/i);
    await page.keyboard.press('l');
    await page.keyboard.press(String(correct2 + 1));
    assert.equal((await game()).scores[1], -700);
    assert.equal(rowValue(k2) > 0, true);
  });

  await test('final jeopardy takes secret wagers and secret picks, then reveals', async () => {
    await reset();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('dbjeopardy'));
      s.scores = [1000, 600];
      localStorage.setItem('dbjeopardy', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#s0');
    assert.equal(await page.locator('#s0').textContent(), '$1000');
    const correct = (await game()).deck.final.correct;
    const answer = (await game()).deck.final.options[correct];
    const wrong = [0, 1, 2, 3].find(i => i !== correct);
    await page.click('#finalBtn');
    await page.waitForSelector('#fw0');
    const security = await page.locator('#fw0').evaluate(el => getComputedStyle(el).webkitTextSecurity);
    assert.equal(security, 'disc');
    await page.fill('#fw0', '99999');
    await page.fill('#fw1', '100');
    await page.click('#showClue');
    await page.waitForSelector('.opt');
    assert.equal(await page.locator('#mopts').innerText().then(t => t.includes(answer)), true);
    await page.keyboard.press(String(correct + 1));
    await page.waitForSelector('#p2go');
    assert.equal(await page.locator('.opt').count(), 0);
    const handoff = await page.locator('#modal').innerText();
    assert.ok(!handoff.includes(answer), 'player 1 pick leaked: ' + handoff);
    await page.click('#p2go');
    await page.waitForSelector('.opt');
    await page.locator(`.opt[data-i="${wrong}"]`).click();
    await page.waitForSelector('.opt.right');
    assert.match(await page.locator(`.opt[data-i="${correct}"]`).getAttribute('class'), /right/);
    assert.match(await page.locator(`.opt[data-i="${wrong}"]`).getAttribute('class'), /wrong/);
    const status = await page.locator('#mstatus').textContent();
    assert.match(status, /correct/i);
    assert.match(status, /wrong/i);
    assert.equal(await page.locator('#s0').textContent(), '$2000');
    assert.equal(await page.locator('#s1').textContent(), '$500');
    await shot('06-final-reveal');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal.show').count(), 0);
    assert.equal(await page.locator('#s0').textContent(), '$2000');
    assert.equal(await page.locator('#s1').textContent(), '$500');
  });

  await test('every clue fits on a 1080p screen and shows four answers', async () => {
    await reset();
    let worst = 0;
    let worstKey = '';
    const s = await game();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const k = c + '-' + r;
        await openTile(k);
        if ((await page.locator('#mclue').textContent()).includes('DAILY DOUBLE')) {
          await page.click('#who0');
          await page.click('#ddGo');
        }
        await page.waitForSelector('.opt');
        const opts = await page.locator('.opt .txt').allTextContents();
        assert.equal(opts.length, 4, k);
        assert.equal(new Set(opts).size, 4, k);
        assert.deepEqual(opts, s.deck[k].options);
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

  await test('names, scores, and answer order persist; new game reshuffles', async () => {
    await reset();
    await page.locator('#p0 input').fill('Ada');
    await page.locator('#p0 input').evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));
    await page.locator('#p1 .adj button').nth(0).click();
    const before = await game();
    assert.equal(before.names[0], 'Ada');
    assert.equal(before.scores[1], -200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#s1');
    const after = await game();
    assert.equal(await page.locator('#p0 input').inputValue(), 'Ada');
    assert.equal(await page.locator('#s1').textContent(), '-$200');
    assert.match(await page.locator('#s1').getAttribute('class'), /neg/);
    assert.deepEqual(after.deck, before.deck);
    assert.deepEqual(after.dd, before.dd);
    page.once('dialog', d => d.accept());
    await page.click('#newBtn');
    await page.waitForFunction(() => {
      const raw = JSON.parse(localStorage.getItem('dbjeopardy'));
      return raw.scores[0] === 0 && raw.scores[1] === 0 && raw.used.length === 0;
    });
    const next = await game();
    assert.equal(next.names[0], 'Ada');
    assert.notDeepEqual(next.deck, before.deck);
    assert.equal(await page.locator('#s1').textContent(), '$0');
  });

  await test('mute and fullscreen keys do not break the board', async () => {
    await reset();
    await page.keyboard.press('m');
    assert.equal(await page.locator('#muteBtn').textContent(), 'Unmute');
    await page.click('#muteBtn');
    assert.equal(await page.locator('#muteBtn').textContent(), 'Mute');
    await page.keyboard.press('f');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.tile').count(), 30);
  });

  const failed = results.filter(r => !r.ok);
  console.log('\n' + results.filter(r => r.ok).length + ' passed, ' + failed.length + ' failed');
  await browser.close();
  server.close();
  if (failed.length) process.exit(1);
}

function correctText(s, k) {
  const d = s.deck[k];
  return d.options[d.correct];
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
