const $ = id => document.getElementById(id);
const motion = matchMedia('(prefers-reduced-motion: no-preference)');
let theme = 'dark';
try { theme = localStorage.getItem('hook-theme') === 'light' ? 'light' : 'dark'; } catch {}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $('theme').textContent = theme === 'dark' ? '☼' : '☾';
  $('theme').setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}
applyTheme();
$('theme').onclick = () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  try { localStorage.setItem('hook-theme', theme); } catch {}
};
if (motion.matches && 'IntersectionObserver' in window) {
  document.body.classList.add('motion');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  });
  document.querySelectorAll('.reveal').forEach(section => observer.observe(section));
}
async function read(path) {
  const response = await fetch(path);
  if (!response.ok) throw Error('Unavailable');
  return response.json();
}
const buttons = [...document.querySelectorAll('[data-phase]')];
buttons.forEach(button => { button.disabled = true; });
try {
  const report = await read('demo-report.json');
  const { simulation, spec } = report;
  const format = new Intl.NumberFormat('en-US');
  $('fork').textContent = 'Saved · Elysium fork';
  $('trips').textContent = format.format(simulation.roundTrips);
  $('block').textContent = format.format(Number(simulation.block));
  $('seed').textContent = format.format(Number(simulation.nativeSeedWei) / 1e18) + ' HYPE';
  const minutes = spec.triggerSeconds / 60;
  const phases = [
    [spec.sellBps, 'Before the registered wallet transfers tokens. The initiating sale can pay this rate.'],
    [spec.triggerSellBps, 'For ' + minutes + ' minutes after the transfer, this rate applies to subsequent sells in the $HOOK pool.'],
    [spec.sellBps, 'The window has expired. The sell fee returns to its steady rate.'],
  ];
  let timer;
  const show = phase => {
    const [bps, note] = phases[phase];
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === phase)));
    $('fee').textContent = bps / 100 + '%';
    $('phase-note').textContent = note;
    if (motion.matches) $('phase-result').animate([{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220 });
  };
  buttons.forEach((button, index) => {
    button.disabled = false;
    button.onclick = () => { clearTimeout(timer); show(index); };
  });
  $('play').disabled = false;
  $('play').onclick = () => {
    clearTimeout(timer);
    if (!motion.matches) return show(1);
    show(0);
    timer = setTimeout(() => {
      show(1);
      timer = setTimeout(() => show(2), 2200);
    }, 550);
  };
  show(0);
} catch {
  $('fork').textContent = 'Report unavailable';
  $('phase-note').textContent = 'The saved report could not load. Refresh to try again.';
}
try {
  const templates = await read('templates.json');
  $('templates').replaceChildren(...templates.map(template => {
    const card = document.createElement('article');
    const title = document.createElement('strong');
    title.textContent = template.name;
    const description = document.createElement('p');
    description.textContent = template.text;
    card.append(title, description);
    return card;
  }));
} catch {
  $('templates').textContent = 'The rule library could not load.';
}
