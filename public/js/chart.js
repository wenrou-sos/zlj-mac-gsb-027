'use strict';
// 极简 SVG 图表库：折线/面积图、横向条形排行、环形占比图
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#0f766e', '#0d9488', '#14b8a6', '#5eead4', '#d97706', '#f59e0b', '#7c3aed', '#a78bfa', '#2563eb', '#60a5fa'];

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  // series: [{name, color?, data: [{label, value, value2?}]}] —— value2 用于双系列
  function lineChart(opts) {
    const { data, height = 260, yFormat = v => v, area = true, labels = 5 } = opts;
    const series = opts.series || [{ name: '', color: PALETTE[0], data }];
    const W = 760, H = height, padL = 56, padR = 16, padT = 18, padB = 34;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = series[0].data.length;
    const maxV = Math.max(1, ...series.flatMap(s => s.data.map(d => d.value)));
    const niceMax = niceCeil(maxV);
    const xAt = i => n <= 1 ? padL + iw / 2 : padL + (i / (n - 1)) * iw;
    const yAt = v => padT + ih - (v / niceMax) * ih;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: `height:${H}px` });
    // 网格 + Y 轴刻度
    for (let i = 0; i <= 4; i++) {
      const y = padT + ih - (i / 4) * ih;
      el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#eef2f7', 'stroke-width': 1 }, svg);
      const t = el('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#94a3b8' }, svg);
      t.textContent = shortNum(niceMax * i / 4);
    }
    // X 轴标签
    const step = Math.max(1, Math.ceil(n / labels));
    series[0].data.forEach((d, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const t = el('text', { x: xAt(i), y: H - 10, 'text-anchor': 'middle', 'font-size': 11, fill: '#94a3b8' }, svg);
      t.textContent = d.label.length > 5 ? d.label.slice(5) : d.label;
    });

    series.forEach((s, si) => {
      const color = s.color || PALETTE[si];
      const pts = s.data.map((d, i) => [xAt(i), yAt(d.value)]);
      if (area && series.length === 1) {
        const path = `M ${pts[0][0]} ${yAt(0)} ` + pts.map(p => `L ${p[0]} ${p[1]}`).join(' ') + ` L ${pts[pts.length - 1][0]} ${yAt(0)} Z`;
        const gradId = 'g' + Math.random().toString(36).slice(2, 8);
        const defs = el('defs', {}, svg);
        const lg = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': .28 }, lg);
        el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': .02 }, lg);
        el('path', { d: path, fill: `url(#${gradId})` }, svg);
      }
      el('polyline', {
        points: pts.map(p => p.join(',')).join(' '), fill: 'none',
        stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }, svg);
      pts.forEach((p, i) => {
        const c = el('circle', { cx: p[0], cy: p[1], r: 3, fill: '#fff', stroke: color, 'stroke-width': 2 }, svg);
        const title = el('title', {}, c);
        title.textContent = `${s.data[i].label} · ${s.name}: ${yFormat(s.data[i].value)}`;
      });
    });
    return svg;
  }

  // 横向条形排行 rows: [{label, sub?, value, format?}]
  function barRank(rows, opts = {}) {
    const { format = v => v, color = '#0f766e' } = opts;
    const max = Math.max(1, ...rows.map(r => r.value));
    const wrap = document.createElement('div');
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:28px 1fr 110px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;';
      const no = document.createElement('span');
      no.className = 'rank-no' + (i < 3 ? ' r' + (i + 1) : '');
      no.textContent = i + 1;
      const mid = document.createElement('div');
      mid.innerHTML = `<div style="font-weight:600;font-size:13px">${esc(r.label)}</div>
        <div class="bar-track mt6"><div class="bar-fill" style="width:${(r.value / max * 100).toFixed(1)}%"></div></div>
        ${r.sub ? `<div class="muted" style="font-size:11.5px;margin-top:3px">${esc(r.sub)}</div>` : ''}`;
      const val = document.createElement('div');
      val.className = 'num';
      val.style.cssText = 'font-weight:700;font-variant-numeric:tabular-nums;text-align:right;font-size:13px;color:' + color;
      val.textContent = format(r.value);
      row.append(no, mid, val);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // 环形图 rows: [{label, value, color?}]
  function donut(rows, opts = {}) {
    const { format = v => v, centerLabel = '', centerValue = '' } = opts;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:22px;align-items:center;flex-wrap:wrap';
    const size = 210, sw = 30, r = (size - sw) / 2, c = size / 2, total = rows.reduce((a, b) => a + b.value, 0) || 1;
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, style: 'flex-shrink:0' });
    let acc = 0;
    rows.forEach((row, i) => {
      const frac = row.value / total;
      const a0 = acc * 2 * Math.PI - Math.PI / 2;
      acc += frac;
      const a1 = acc * 2 * Math.PI - Math.PI / 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (ang, rr) => [c + rr * Math.cos(ang), c + rr * Math.sin(ang)];
      const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r);
      const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
      const seg = el('path', { d: path, fill: 'none', stroke: row.color || PALETTE[i % PALETTE.length], 'stroke-width': sw }, svg);
      const title = el('title', {}, seg);
      title.textContent = `${row.label} ${format(row.value)}（${(frac * 100).toFixed(1)}%）`;
    });
    const t1 = el('text', { x: c, y: c - 4, 'text-anchor': 'middle', 'font-size': 12, fill: '#94a3b8' }, svg);
    t1.textContent = centerLabel;
    const t2 = el('text', { x: c, y: c + 20, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: '#0f766e' }, svg);
    t2.textContent = centerValue || shortNum(total);

    const legend = document.createElement('div');
    legend.style.cssText = 'flex:1;min-width:180px';
    rows.forEach((row, i) => {
      const frac = (row.value / total * 100);
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:13px;border-bottom:1px dashed #e2e8f0';
      d.innerHTML = `<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${row.color || PALETTE[i % PALETTE.length]};margin-right:7px;vertical-align:-1px"></i>${esc(row.label)}</span>
        <b style="font-variant-numeric:tabular-nums">${format(row.value)} <span class="muted" style="font-weight:400">${frac.toFixed(1)}%</span></b>`;
      legend.appendChild(d);
    });
    wrap.append(svg, legend);
    return wrap;
  }

  // 堆叠条（收款方式构成） segs: [{label, value, color}]
  function stackedBar(segs, opts = {}) {
    const { format = v => v } = opts;
    const total = segs.reduce((a, b) => a + b.value, 0) || 1;
    const wrap = document.createElement('div');
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;height:26px;border-radius:8px;overflow:hidden;background:#f1f5f9';
    segs.forEach((s, i) => {
      const part = document.createElement('div');
      part.style.cssText = `background:${s.color};width:${(s.value / total * 100).toFixed(2)}%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11.5px;font-weight:700;min-width:${s.value ? 34 : 0}px`;
      part.textContent = (s.value / total * 100).toFixed(0) + '%';
      part.title = `${s.label} ${format(s.value)}`;
      bar.appendChild(part);
    });
    wrap.appendChild(bar);
    const lg = document.createElement('div');
    lg.className = 'legend mt16';
    segs.forEach((s, i) => {
      lg.innerHTML += `<span><i style="background:${s.color}"></i>${esc(s.label)} ${format(s.value)}</span>`;
    });
    wrap.appendChild(lg);
    return wrap;
  }

  function niceCeil(v) {
    if (v <= 10) return Math.ceil(v);
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function shortNum(v) {
    if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + 'w';
    return Math.round(v).toLocaleString();
  }

  window.Charts = { lineChart, barRank, donut, stackedBar, PALETTE };
})();
