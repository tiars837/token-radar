// Token Radar's dashboard (model radar-2-comps). It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan, a live-token view, a model sandbox and the
// comps calibration the model computed from this snapshot. No network: every byte it shows is in
// data.js. Hash routes: #detail=<slug> opens a protocol, #cat=<Category> filters the board.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchOnly: false };
  var sandbox = { growth: DATA.model.growth_weight, maturity: DATA.model.maturity_floor, chain: DATA.model.chain_bonus };
  var M = DATA.model;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // comps_multiple is the median market-cap/TVL of the row's category, computed from this snapshot.
  function impliedOf(row, model) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = model.maturity + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var chains = 1 + model.chain * Math.min(Math.max((row.chains || []).length - 1, 0), M.chain_bonus_max);
    return Math.max(1, Math.round(row.tvl_usd * row.comps_multiple * growthMult * maturity * chains));
  }
  function sandboxChanged() {
    return sandbox.growth !== M.growth_weight || sandbox.maturity !== M.maturity_floor || sandbox.chain !== M.chain_bonus;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('onchain capital') >= 0 || c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-yield strategy on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as collateral on ' + name + ' and open one small options position.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply top-up, a borrow and repay, or a vote';
    if (c.indexOf('dex') >= 0) return 'a swap, a liquidity top-up, or a vote';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('aggregator') >= 0) return 'a deposit, a vault rebalance, or a vote';
    if (c.indexOf('bridge') >= 0) return 'a bridge, a swap on the destination chain, or a vote';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'a stake top-up, a restake, or a vote';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('options') >= 0) return 'a trade, a margin top-up, or a vote';
    if (c.indexOf('rwa') >= 0) return 'a mint, a redemption, or a vote';
    return 'a deposit, a swap, or a vote';
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    var extra = p.chains.length > 1 ? ' Repeat the position on ' + p.chains[1] + ' once, so the farm is not tied to a single chain.' : '';
    return [
      ['Set up a clean wallet', 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas', '5 minutes'],
      ['Take the position', actionFor(p, capital, chain) + extra, '$' + capital + ' of capital', '15 minutes'],
      ['Stay active weekly', 'Make one qualifying action each week, such as ' + weeklyActionFor(p) + '.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold for ' + hold + ' days', 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'],
      ['Claim safely', "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, never pay to claim', '10 minutes'],
      ['Log everything', 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes']
    ];
  }

  var watchSet = {};
  DATA.rows.forEach(function (r) { if (r.rank <= DATA.watchlist_size + DATA.early_size) watchSet[r.slug] = true; });
  var watchlistSlugs = {};
  // The watchlist itself is not in data.js; ranks 1..240 mix watchlist and early rows, so the
  // detail view marks a row "watchlist" when its TVL is at or above the snapshot floor and it
  // records no token — the same floor the house drew. The board table shows the floor instead.
  function isWatch(r) { return r.tvl_usd >= DATA.floor_usd; }

  function categories() {
    var seen = {}, out = [];
    DATA.rows.forEach(function (r) { var c = r.category || 'Uncategorised'; if (!seen[c]) { seen[c] = 1; out.push(c); } });
    return out.sort();
  }
  function chains() {
    var seen = {}, out = [];
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } }); });
    return out.sort();
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !isWatch(r)) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -999 : a.change_7d; vb = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'name') { return state.dir * (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
      else { va = sandboxChanged() ? impliedOf(a, sandbox) : a.implied_value_usd; vb = sandboxChanged() ? impliedOf(b, sandbox) : b.implied_value_usd; }
      return state.dir * (va - vb);
    });
    return rows;
  }

  function renderStats() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var top = DATA.rows[0];
    return el('section', { class: 'stats' },
      el('div', { class: 'stat' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'protocols ranked' })),
      el('div', { class: 'stat' }, el('b', { text: String(DATA.watchlist_size) }), el('span', { text: 'on the watchlist (floor $50M TVL)' })),
      el('div', { class: 'stat' }, el('b', { text: String(DATA.early_size) }), el('span', { text: 'early finds below the floor' })),
      el('div', { class: 'stat warn' }, el('b', { text: fmtUsd(total) }), el('span', { text: 'total implied value, board' })),
      el('div', { class: 'stat' }, el('b', { text: top ? top.name : '—' }), el('span', { text: 'rank 1 · ' + fmtUsd(top ? top.implied_value_usd : 0) + ' implied' })));
  }

  function renderControls() {
    var cats = categories(), chs = chains();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' });
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' });
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chs.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; render(); });
    var sortSel = el('select', { 'aria-label': 'Sort by' });
    [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['name', 'Sort: name']].forEach(function (o) {
      sortSel.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    sortSel.value = state.sort;
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; state.dir = state.sort === 'name' ? 1 : -1; render(); });
    var wl = el('label', null, el('input', { type: 'checkbox', checked: state.watchOnly ? true : null }), document.createTextNode(' Watchlist floor only (TVL ≥ $50M)'));
    wl.querySelector('input').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });
    return el('div', { class: 'controls' }, search, catSel, chainSel, sortSel, wl);
  }

  function renderTable(rows) {
    var head = el('thead', null, el('tr', null,
      el('th', { class: 'num', text: '#', onclick: function () { setSort('implied'); } }),
      el('th', { text: 'Protocol', onclick: function () { setSort('name'); } }),
      el('th', { text: 'Category' }),
      el('th', { text: 'Chains' }),
      el('th', { class: 'num', text: 'TVL', onclick: function () { setSort('tvl'); } }),
      el('th', { class: 'num', text: '7d', onclick: function () { setSort('growth'); } }),
      el('th', { class: 'num', text: 'Age', onclick: function () { setSort('age'); } }),
      el('th', { class: 'num', text: 'Comps ×' }),
      el('th', { class: 'num', text: 'Implied value', onclick: function () { setSort('implied'); } })));
    var body = el('tbody');
    rows.slice(0, 120).forEach(function (r) {
      var val = sandboxChanged() ? impliedOf(r, sandbox) : r.implied_value_usd;
      var tr = el('tr', { class: state.selected === r.slug ? 'sel' : null, onclick: function () { select(r.slug); } },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'nm', text: r.name }), el('div', { class: 'sl', text: r.slug + (isWatch(r) ? '  ·  WATCHLIST' : '') })),
        el('td', null, el('span', { class: 'cat', text: r.category || '—' })),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'dn'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.comps_multiple.toFixed(2) + '×' }),
        el('td', { class: 'num val', text: fmtUsd(val) }));
      body.appendChild(tr);
    });
    return el('table', null, head, body);
  }

  function renderLive() {
    var head = el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }),
      el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Mcap / TVL' })));
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      body.appendChild(el('tr', { onclick: function () { state.tab = 'pre-token'; render(); } },
        el('td', null, el('div', { class: 'nm', text: r.name }), el('div', { class: 'sl', text: r.slug })),
        el('td', null, el('span', { class: 'cat', text: r.category || '—' })),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num val', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'dn'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : 'n/a' })));
    });
    return el('div', null,
      el('p', { class: 'note', text: 'These protocols already trade, so the board shows the market\u2019s own value — never a model\u2019s. They are the comps the model is calibrated on: the median market-cap/TVL of each category sets that category\u2019s multiple.' }),
      el('table', null, head, body));
  }

  function renderDrawer() {
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === state.selected) r = x; });
    if (!r) return null;
    var val = sandboxChanged() ? impliedOf(r, sandbox) : r.implied_value_usd;
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var growthMult = 1 + (growth / 100) * sandbox.growth;
    var age = r.age_days === null ? M.unknown_age_days : r.age_days;
    var maturity = sandbox.maturity + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var chains = 1 + sandbox.chain * Math.min(Math.max((r.chains || []).length - 1, 0), M.chain_bonus_max);
    var steps = farmSteps(r);
    var drawer = el('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Protocol detail' },
      el('button', { class: 'close', text: 'Close ×', onclick: function () { select(null); } }),
      el('h2', { text: r.name }),
      el('div', { class: 'meta', text: '#' + r.rank + ' · ' + r.slug + ' · ' + (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') + (isWatch(r) ? ' · on the watchlist' : ' · early find') }),
      el('h3', { text: 'Implied value — the working' }),
      el('dl', { class: 'kv' },
        el('dt', { text: 'TVL' }), el('dd', { text: fmtUsd(r.tvl_usd) }),
        el('dt', { text: 'Comps multiple (' + (r.category || 'Uncategorised') + ')' }), el('dd', { text: r.comps_multiple.toFixed(2) + '×' }),
        el('dt', { text: '7d growth → multiplier' }), el('dd', { text: fmtPct(r.change_7d) + ' → ' + growthMult.toFixed(2) + '×' }),
        el('dt', { text: 'Age → maturity' }), el('dd', { text: fmtAge(r.age_days) + ' → ' + maturity.toFixed(2) + '×' }),
        el('dt', { text: 'Chains → multiplier' }), el('dd', { text: (r.chains || []).length + ' → ' + chains.toFixed(2) + '×' }),
        el('dt', { text: 'Implied value' }), el('dd', null, el('b', { text: fmtUsd(val) }))),
      el('p', { class: 'note', text: 'Why it ranks here: ' + fmtUsd(r.tvl_usd) + ' of TVL at a ' + r.comps_multiple.toFixed(2) + '× comps multiple for ' + (r.category || 'its category') + ', ' + (r.change_7d === null ? 'no 7d change reported' : '7d ' + fmtPct(r.change_7d)) + ', running ' + fmtAge(r.age_days) + ' with no token recorded. The sandbox below re-runs this arithmetic live.' }),
      el('h3', { text: 'How to farm it' }),
      el('ol', { class: 'farm' }, steps.map(function (s) {
        return el('li', null, el('b', { text: s[0] + '. ' }), document.createTextNode(s[1] + ' '), el('span', { text: 'Cost: ' + s[2] + '. Time: ' + s[3] + '.' }));
      })));
    return drawer;
  }

  function renderSandbox() {
    function slider(label, key, min, max, step, fmt) {
      var out = el('output', { text: fmt(sandbox[key]) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(sandbox[key]), 'aria-label': label });
      input.addEventListener('input', function () { sandbox[key] = parseFloat(input.value); out.textContent = fmt(sandbox[key]); renderTableOnly(); });
      return el('label', null, document.createTextNode(label + ' '), out, input);
    }
    return el('section', { class: 'sandbox' },
      el('h3', { text: 'Model sandbox — change the model, watch the board move' }),
      el('p', { text: 'The comps multiples stay fixed (they are the snapshot\u2019s own calibration); these three weights are yours to test. Implied values recompute live; the ranked board in board.json uses the published weights.' }),
      el('div', { class: 'sliders' },
        slider('Growth weight', 'growth', 0, 1, 0.05, function (v) { return v.toFixed(2); }),
        slider('Maturity floor', 'maturity', 0.3, 0.9, 0.05, function (v) { return v.toFixed(2); }),
        slider('Chain bonus', 'chain', 0, 0.1, 0.01, function (v) { return v.toFixed(2); })),
      el('p', { class: 'note', text: sandboxChanged() ? 'Sandbox active: the table below shows recomputed implied values, not the published board.' : 'Sandbox at the published weights: the table matches board.json exactly.' }));
  }

  function renderMethod() {
    var compsRows = DATA.comps.map(function (c) {
      return el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.sample) }), el('td', { class: 'num', text: c.multiple.toFixed(3) + '×' }));
    });
    return el('section', { class: 'method' },
      el('h3', { text: 'How the radar works — model ' + DATA.model_version }),
      el('p', { text: 'Every row starts from the sealed snapshot only: TVL, 7d change, listing date, chains and whether a token is recorded. The comps multiple is the median market-cap/TVL of the live-token protocols in the same category, computed from this snapshot at run time (global median ' + DATA.comps_global.toFixed(3) + '× where a category has fewer than five live tokens). Implied value = TVL × comps × growth × maturity × chains. No protocol name is special-cased; the same function scores every row.' }),
      el('p', null, el('code', { text: 'implied = round(TVL × comps × (1 + clamp(7d, −60, 120)% × 0.5) × (0.6 + min(age, 1095)/1095 × 0.4) × (1 + 0.04 × min(chains − 1, 5)))' })),
      el('p', { text: '“Pre-token” means the snapshot records no token for the protocol — no market cap, no CoinGecko id, no symbol. That is DefiLlama\u2019s record, not proof: a protocol on the list may still have a token its record does not carry. The watchlist is the floor, never the ceiling: this board adds the 200 largest pre-token protocols below the $50M floor, the early finds the radar exists to catch. Live-token protocols are shown apart, at the market\u2019s own value.' }),
      el('h3', { text: 'Comps calibration — computed from this snapshot' }),
      el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live sample' }), el('th', { class: 'num', text: 'Multiple' }))),
        el('tbody', null, compsRows)),
      el('p', { class: 'note', text: 'Source: ' + DATA.source + ' · Snapshot as of ' + DATA.as_of + ' · ' + DATA.rows.length + ' rows ranked, ' + DATA.live.length + ' live tokens shown · Dashboard renders with no network; all data is in data.js beside this page.' }));
  }

  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
    render();
  }
  function select(slug) {
    state.selected = slug;
    if (slug) { try { history.replaceState(null, '', '#detail=' + slug); } catch (e) { /* no history */ } }
    else { try { history.replaceState(null, '', location.pathname); } catch (e) { /* no history */ } }
    render();
  }
  function renderTableOnly() {
    // Re-render just the table area after a sandbox slider moves: rebuild the whole view is cheap
    // and keeps every number consistent, so reuse render().
    render();
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var wrap = el('div', { class: 'wrap' });
    wrap.appendChild(renderStats());
    var tabs = el('div', { class: 'tabs' });
    [['pre-token', 'Pre-token board (' + DATA.board_size + ')'], ['live', 'Live tokens (' + DATA.live_size + ')']].forEach(function (t) {
      tabs.appendChild(el('button', { class: 'tab' + (state.tab === t[0] ? ' on' : ''), text: t[1], onclick: function () { state.tab = t[0]; render(); } }));
    });
    wrap.appendChild(tabs);
    if (state.tab === 'live') {
      wrap.appendChild(renderLive());
    } else {
      wrap.appendChild(renderControls());
      var rows = filteredRows();
      wrap.appendChild(el('p', { class: 'count', html: 'Showing <b>' + Math.min(rows.length, 120) + '</b> of <b>' + rows.length + '</b> matching protocols' + (rows.length > 120 ? ' (first 120 — narrow the filters to see the rest)' : '') + '.' }));
      if (rows.length === 0) wrap.appendChild(el('div', { class: 'empty', text: 'No protocol matches those filters. Clear the search or pick another category.' }));
      else wrap.appendChild(renderTable(rows));
      wrap.appendChild(renderSandbox());
    }
    wrap.appendChild(renderMethod());
    app.appendChild(wrap);
    var drawer = renderDrawer();
    if (drawer) app.appendChild(drawer);
  }

  // Hash routes, for deep links and the screenshots: #detail=<slug>, #cat=<Category>.
  (function () {
    var h = location.hash || '';
    var m = /#detail=([A-Za-z0-9._-]+)/.exec(h);
    if (m) state.selected = m[1];
    var c = /[#&]cat=([^&#]+)/.exec(h);
    if (c) state.category = decodeURIComponent(c[1]);
  })();

  render();
})();
