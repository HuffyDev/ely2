const $ = id => document.getElementById(id);
const dark = matchMedia('(prefers-color-scheme: dark)');
function theme(value) {
  document.documentElement.dataset.theme = value;
  $('theme').textContent = value === 'dark' ? 'Light mode' : 'Dark mode';
}
theme(localStorage.getItem('hook-theme') ?? (dark.matches ? 'dark' : 'light'));
$('theme').onclick = () => {
  const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('hook-theme', value);
  theme(value);
};
$('example').onclick = () => use({ text: 'After a transfer out of the registered creator wallet, charge 5% on subsequent sells in the $HOOK pool for 30 minutes.' });
const el = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};
const use = template => {
  $('prompt').value = template.text;
  $('prompt').focus();
  location.hash = 'studio';
};
$('tokenSalt').value = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
function atomicUnits(value) {
  if (!/^\d{1,20}(\.\d{1,18})?$/.test(value)) throw Error('Enter a nonnegative amount with up to 18 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'))).toString();
}
function launchDetails() {
  const creator = $('creator').value.trim();
  if (!creator) return undefined;
  return {
    creator, name: $('coinName').value, symbol: $('symbol').value,
    tokenSalt: $('tokenSalt').value, funding: atomicUnits($('funding').value),
    liquidity: atomicUnits($('liquidity').value), initialTick: Number($('initialTick').value),
    creatorAllocation: atomicUnits($('allocation').value),
  };
}
function show(report) {
  const target = $('report');
  const table = el('table', '');
  const header = table.createTHead().insertRow();
  for (const label of ['Elapsed', 'Buy fee', 'Subsequent sell fee']) header.append(el('th', label));
  const body = table.createTBody();
  for (const check of report.checks) {
    const row = body.insertRow();
    for (const value of [check.seconds + 's', check.buy / 100 + '%', check.sell / 100 + '%']) row.append(el('td', value));
  }
  const link = el('a', 'Open shareable report ↗');
  link.href = '/?report=' + report.id + '#studio';
  const sim = report.simulation;
  const result = sim?.status === 'passed'
    ? sim.roundTrips + ' holder round trips passed · ' + sim.environment + (sim.block ? ' at block ' + sim.block : '') + ' · ' + sim.executionGas.toLocaleString() + ' execution gas · seed ' + sim.nativeSeedWei + ' wei.'
    : sim?.reason ?? 'This report predates execution checks.';
  const note = report.spec.triggerSeconds
    ? 'The schedule applies to subsequent sells in the $HOOK pool after an outgoing transfer from the registered creator wallet. The initiating sale can pay the prior rate.'
    : 'The schedule shows LP fees at the phase boundaries.';
  target.replaceChildren(el('div', report.source, 'eyebrow'), el('h2', 'Behaviour report'), el('p', note), table,
    el('p', result));
  if (report.launch) target.append(el('p', 'Tested ' + report.launch.name + ' (' + report.launch.symbol + ') for ' + report.launch.creator + '.'));
  if (report.cost) {
    const dollars = report.cost.seedUsd == null ? 'USD estimate unavailable' :
      'approximately ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(report.cost.seedUsd) +
      ' at the HYPE/USDC spot midpoint (' + report.cost.asOf + ')';
    target.append(el('p', report.cost.seedHype + ' HYPE permanently locked · ' + dollars + '.'));
  }
  if (report.reportHash) target.append(el('p', 'Report hash ' + report.reportHash, 'report-hash'));
  target.append(el('p', 'A signing quote including rollup posting charges is unavailable while launch is locked.'), link);
}
async function read(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw Error(data.error);
  return data;
}
$('draft').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type=submit]');
  button.disabled = true;
  $('error').textContent = '';
  button.textContent = 'Drafting and rehearsing…';
  $('report').setAttribute('aria-busy', 'true');
  try {
    const report = await read('/api/draft', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ prompt: $('prompt').value, launch: launchDetails() }) });
    show(report);
    history.replaceState(null, '', '/?report=' + report.id + '#studio');
  } catch (error) {
    $('error').textContent = error.message;
  } finally {
    $('report').removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = 'Draft and test ↗';
  }
});
try {
  const { templates, ai } = await read('/api/library');
  $('mode').textContent = ai ? 'CLAUDE SONNET 5.5' : 'TEMPLATE MODE';
  for (const template of templates) {
    const card = el('button', '', 'template');
    card.append(el('strong', template.name + ' ↗'), el('p', template.text));
    card.onclick = () => use(template);
    $('templates').append(card);
  }
  const id = new URLSearchParams(location.search).get('report');
  if (id && /^[a-f0-9-]{36}$/.test(id)) show(await read('/api/reports/' + id));
} catch (error) {
  $('error').textContent = error.message;
}
