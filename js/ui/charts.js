/* Arcadia POS — tiny dependency-free SVG charts */
(function () {
  const App = (window.App = window.App || {});
  const U = App.utils;
  const C = (App.charts = {});
  const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  C.colors = SERIES;

  /* stacked bars: labels[], series [{name, values[]}] */
  C.bars = (labels, series, { height = 220, money = true } = {}) => {
    const W = Math.max(320, labels.length * 28), H = height, pad = { l: 8, r: 8, t: 12, b: 4 };
    const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0));
    const max = Math.max(1, ...totals) * 1.1;
    const bw = (W - pad.l - pad.r) / labels.length;
    const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    let bars = '';
    labels.forEach((lab, i) => {
      let acc = 0;
      series.forEach((s, si) => {
        const v = Math.max(0, s.values[i] || 0);
        if (!v) return;
        const y1 = y(acc + v), y0 = y(acc);
        bars += `<rect x="${pad.l + i * bw + bw * 0.18}" y="${y1}" width="${bw * 0.64}" height="${Math.max(0, y0 - y1)}" rx="3" fill="${SERIES[si % SERIES.length]}"><title>${U.esc(lab)} · ${U.esc(s.name)}: ${money ? U.money(v) : v}</title></rect>`;
        acc += v;
      });
    });
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${W}" y1="${y((max / 1.1) * f)}" y2="${y((max / 1.1) * f)}"/>`).join('');
    const step = Math.ceil(labels.length / 14);
    const xl = `<div class="chart-x" style="padding:0 ${(pad.l / W) * 100}% 0 ${(pad.l / W) * 100}%">${labels.map((l, i) => `<span>${i % step === 0 ? U.esc(l) : ''}</span>`).join('')}</div>`;
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-bars"><g class="grid">${grid}</g>${bars}</svg>${xl}
      <div class="legend">${series.map((s, i) => `<span><i style="background:${SERIES[i % SERIES.length]}"></i>${U.esc(s.name)}</span>`).join('')}</div></div>`;
  };

  C.donut = (items, { center = '', sub = '' } = {}) => {
    const total = items.reduce((a, x) => a + Math.max(0, x.value), 0);
    if (!total) return App.ui.empty('No data for this period', '', 'chart');
    const R = 60, r = 40, cx = 70, cy = 70;
    let a0 = -Math.PI / 2, paths = '';
    items.forEach((it, i) => {
      const v = Math.max(0, it.value);
      if (!v) return;
      const a1 = a0 + (v / total) * Math.PI * 2 - 0.0001;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
      paths += `<path d="M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z" fill="${SERIES[i % SERIES.length]}"><title>${U.esc(it.label)}: ${U.money(v)}</title></path>`;
      a0 = a1 + 0.0001;
    });
    return `<div class="donut"><svg viewBox="0 0 140 140">${paths}<text x="70" y="68" text-anchor="middle" class="d-center">${U.esc(center)}</text><text x="70" y="84" text-anchor="middle" class="d-sub">${U.esc(sub)}</text></svg>
      <ul>${items.map((it, i) => `<li><i style="background:${SERIES[i % SERIES.length]}"></i><span>${U.esc(it.label)}</span><strong>${U.money(it.value)}</strong><em>${((Math.max(0, it.value) / total) * 100).toFixed(0)}%</em></li>`).join('')}</ul></div>`;
  };

  C.hbars = (items, { money = true } = {}) => {
    const max = Math.max(1, ...items.map((x) => x.value));
    return `<div class="hbars">${items.map((x, i) => `<div class="hbar"><div class="hbar-top"><span>${U.esc(x.label)}</span><strong>${money ? U.money(x.value) : x.value}${x.sub ? ` <em>${U.esc(x.sub)}</em>` : ''}</strong></div><div class="hbar-track"><div style="width:${(x.value / max) * 100}%;background:${SERIES[i % SERIES.length]}"></div></div></div>`).join('') || App.ui.empty('No data', '', 'chart')}</div>`;
  };

  C.spark = (values) => {
    if (!values.length) return '';
    const W = 100, H = 28, max = Math.max(1, ...values), min = Math.min(0, ...values);
    const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  };
})();
