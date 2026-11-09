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
const el = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};
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
    ? sim.roundTrips + ' holder round trips passed · ' + sim.environment + (sim.block ? ' at block ' + sim.block : '') + ' · ' + sim.executionGas.toLocaleString() + ' execution gas · seed ' + sim.nativeSeedWei + ' wei of simulated seed.'
    : sim?.reason ?? 'This report predates execution checks.';
  const note = report.spec.triggerSeconds
    ? 'The schedule applies to subsequent sells in the $HOOK pool after an outgoing transfer from the registered creator wallet. The initiating sale can pay the prior rate.'
    : 'The schedule shows LP fees at the phase boundaries.';
  target.replaceChildren(el('div', report.source, 'eyebrow'), el('h2', 'Behaviour report'), el('p', note), table,
    el('p', result));
  if (report.launch) target.append(el('p', 'Simulated ' + report.launch.name + ' (' + report.launch.symbol + ') for ' + report.launch.creator + '.'));
  if (report.cost) {
    const dollars = report.cost.seedUsd == null ? 'USD estimate unavailable' :
      'approximately ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(report.cost.seedUsd) +
      ' at the HYPE/USDC spot midpoint (' + report.cost.asOf + ')';
    target.append(el('p', report.cost.seedHype + ' HYPE permanently locked · ' + dollars + '.'));
  }
  if (report.reportHash) target.append(el('p', 'Report hash ' + report.reportHash, 'report-hash'));
  target.append(el('p', 'These results apply to the simulated pool and trades. The preview cannot submit a launch.'), link);
}
async function read(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw Error(data.error);
  return data;
}
$('example').onclick = () => document.getElementById('report').scrollIntoView({ block: 'start' });
try {
  show(await read('/demo-report.json'));
} catch {
  $('report').replaceChildren(el('h2', 'Saved report unavailable'), el('p', 'Refresh to try again. Launches remain locked.'));
}
try {
  const templates = await read('/templates.json');
  for (const template of templates) {
    const card = el('article', '', 'template');
    card.append(el('strong', template.name), el('p', template.text));
    $('templates').append(card);
  }
} catch {
  $('templates').replaceChildren(el('p', 'The behaviour library is unavailable.'));
}
