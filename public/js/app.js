'use strict';
/* 御足堂连锁管理平台 · 前端单文件应用 */

// ---------------- 基础工具 ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

const state = {
  token: localStorage.getItem('yzt_token') || '',
  user: JSON.parse(localStorage.getItem('yzt_user') || 'null'),
  meta: null
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const money = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN');
const num = (n) => Number(n || 0).toLocaleString('zh-CN');
const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '—';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const PAY_LABEL = { cash: '现金', card: '刷卡', member: '会员卡' };
const PAY_COLOR = { cash: '#16a34a', card: '#2563eb', member: '#7c3aed' };
const SHIFT_LABEL = { morning: '白班', evening: '晚班' };

async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json', 'X-Token': state.token } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  let res;
  try { res = await fetch(path, opt); }
  catch { throw new Error('网络异常，请检查服务是否启动'); }
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  if (res.status === 401) { logout(); throw new Error(json?.error || '登录已过期'); }
  if (!res.ok || !json?.ok) throw new Error(json?.error || `请求失败 (${res.status})`);
  return json.data;
}

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toast').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2400);
}

// ---------------- 模态框 ----------------
function openModal({ title, body, wide = false, footer = null, onMounted = null }) {
  const root = $('#modal-root');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  const modal = document.createElement('div');
  modal.className = 'modal' + (wide ? ' wide' : '');
  modal.innerHTML = `
    <div class="modal-head"><h3>${esc(title)}</h3><button class="x" data-close>×</button></div>
    <div class="modal-body"></div>
    ${footer !== null ? '<div class="modal-foot"></div>' : ''}`;
  const bd = $('.modal-body', modal);
  if (typeof body === 'string') bd.innerHTML = body;
  else if (body instanceof Node) bd.appendChild(body);
  if (footer !== null) {
    const ft = $('.modal-foot', modal);
    if (typeof footer === 'string') ft.innerHTML = footer;
    else if (footer instanceof Node) ft.appendChild(footer);
  }
  mask.appendChild(modal);
  root.appendChild(mask);
  const close = () => { mask.remove(); document.removeEventListener('keydown', escClose); };
  const escClose = (e) => { if (e.key === 'Escape') close(); };
  mask.addEventListener('click', e => { if (e.target === mask || e.target.closest('[data-close]')) close(); });
  modal._close = close;
  if (onMounted) onMounted(modal, close);
  return modal;
}
function confirmBox(message, onYes, opts = {}) {
  const modal = openModal({
    title: opts.title || '请确认',
    body: `<div style="padding:6px 0;font-size:14px">${esc(message)}</div>`,
    footer: `<button class="btn" data-close>取消</button> <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-yes>${opts.yesText || '确定'}</button>`
  });
  $('[data-yes]', modal).addEventListener('click', () => { modal._close(); onYes(); });
}

// ---------------- 签字板 ----------------
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false, hasInk = false, last = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [p.clientX - r.left, p.clientY - r.top];
  };
  const start = (e) => {
    e.preventDefault(); drawing = true; hasInk = true; last = pos(e);
    canvas.parentElement.querySelector('.sig-tip')?.remove();
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const [x, y] = pos(e);
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(x, y); ctx.stroke();
    last = [x, y];
  };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; },
    hasInk: () => hasInk,
    dataURL: () => canvas.toDataURL('image/png')
  };
}

// ---------------- 登录 ----------------
function renderLogin() {
  app.innerHTML = `
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">🦶</div>
      <h1>御足堂 · 连锁管理平台</h1>
      <div class="sub">总部统一定价 · 会员 · 提成 ｜ 门店交班收银</div>
      <div class="login-tabs">
        <button data-role="hq" class="active">总部登录</button>
        <button data-role="manager">门店登录</button>
      </div>
      <form id="login-form">
        <div class="field"><label>账号</label><input name="username" autocomplete="username" placeholder="总部账号 admin"></div>
        <div class="field"><label>密码</label><input name="password" type="password" autocomplete="current-password" placeholder="默认密码 123456"></div>
        <button class="btn btn-primary btn-block" type="submit">登 录</button>
      </form>
      <div class="login-hint" id="login-hint">
        演示账号：<b>admin / 123456</b>（总部运营中心）
      </div>
    </div>
  </div>`;
  let role = 'hq';
  $$('.login-tabs button').forEach(b => b.addEventListener('click', () => {
    role = b.dataset.role;
    $$('.login-tabs button').forEach(x => x.classList.toggle('active', x === b));
    $('[name=username]').placeholder = role === 'hq' ? '总部账号 admin' : '门店账号 store1 ~ store6';
    $('#login-hint').innerHTML = role === 'hq'
      ? '演示账号：<b>admin / 123456</b>（总部运营中心）'
      : '演示账号：<b>store1 ~ store6 / 123456</b>（如 store1 = 上海静安旗舰店）';
  }));
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const username = f.querySelector('[name=username]').value.trim();
    const password = f.querySelector('[name=password]').value;
    if (!username || !password) return toast('请输入账号和密码', 'error');
    try {
      const data = await api('POST', '/api/auth/login', { username, password });
      state.token = data.token; state.user = data.user;
      localStorage.setItem('yzt_token', data.token);
      localStorage.setItem('yzt_user', JSON.stringify(data.user));
      toast('欢迎回来，' + data.user.name, 'ok');
      location.hash = data.user.role === 'hq' ? '#/hq/dashboard' : '#/store/dashboard';
      boot();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function logout() {
  api('POST', '/api/auth/logout', { token: state.token }).catch(() => {});
  state.token = ''; state.user = null; state.meta = null;
  localStorage.removeItem('yzt_token'); localStorage.removeItem('yzt_user');
  location.hash = '#/login';
  renderLogin();
}

// ---------------- 布局与导航 ----------------
const HQ_MENU = [
  ['总览', '#/hq/dashboard', '📊'],
  ['项目与定价', '#/hq/pricing', '🏷️'],
  ['会员体系', '#/hq/membership', '💳'],
  ['提成标准', '#/hq/commission', '💰'],
  ['门店管理', '#/hq/stores', '🏬'],
  ['技师档案', '#/hq/employees', '👥'],
  ['调动记录', '#/hq/transfers', '🔁'],
  ['会员名册', '#/hq/members', '📇']
];
const STORE_MENU = [
  ['门店看板', '#/store/dashboard', '📊'],
  ['交班工作台', '#/store/shift', '📝'],
  ['交班报表', '#/store/shifts', '📋'],
  ['本店技师', '#/store/employees', '👥'],
  ['会员管理', '#/store/members', '💳'],
  ['调动记录', '#/store/transfers', '🔁']
];

function renderLayout(activeHash) {
  const u = state.user;
  const isHq = u.role === 'hq';
  const menu = isHq ? HQ_MENU : STORE_MENU;
  const storeName = !isHq && state.meta ? state.meta.stores.find(s => s.id === u.storeId)?.name : '';
  app.innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span class="logo">🦶</span>
        <b>御足堂</b>
        <span>${isHq ? '连锁品牌 · 总部管理端' : '门店收银管理端'}</span>
      </div>
      <nav class="nav">
        <div class="nav-group">${isHq ? '总部管控' : '门店作业'}</div>
        ${menu.map(([label, hash, ico]) =>
      `<a href="${hash}" data-hash="${hash}" class="${activeHash.startsWith(hash) ? 'active' : ''}"><span class="ico">${ico}</span>${label}</a>`).join('')}
      </nav>
      <div class="side-foot">
        ${isHq ? '总部运营中心' : esc(storeName || '门店')}<br/>
        <a id="logout-link" style="color:#7dd3fc">退出登录</a>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="page-title" id="page-title"></div>
        <div class="who">
          <span class="role-badge ${isHq ? '' : 'store'}">${isHq ? '总部' : '门店'}</span>
          <span>${esc(u.name)}</span>
        </div>
      </header>
      <main class="content" id="content"></main>
    </div>
  </div>`;
  $('#logout-link').addEventListener('click', logout);
}

function setTitle(t) { const el = $('#page-title'); if (el) el.textContent = t; }
function setContent(node) {
  const c = $('#content');
  c.innerHTML = '';
  c.appendChild(node);
}
function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

// 元数据
async function loadMeta(force = false) {
  if (!state.meta || force) state.meta = await api('GET', '/api/meta');
  return state.meta;
}
const storeName = (id) => state.meta?.stores.find(s => s.id === id)?.name || id || '—';
const itemMap = () => new Map(state.meta.items.map(i => [i.id, i]));
const levelName = (id) => state.meta?.memberLevels.find(l => l.id === id)?.name || '';
const techLevelName = (id) => state.meta?.technicianLevels.find(l => l.id === id)?.name || '';

// ---------------- 路由 ----------------
const routes = {};
function route(hash, fn) { routes[hash] = fn; }

async function boot() {
  if (!state.token || !state.user) return renderLogin();
  try { await loadMeta(true); }
  catch { return renderLogin(); }
  let hash = location.hash || (state.user.role === 'hq' ? '#/hq/dashboard' : '#/store/dashboard');
  if (hash === '#/' || hash === '') hash = state.user.role === 'hq' ? '#/hq/dashboard' : '#/store/dashboard';
  if (hash === '#/login') { renderLogin(); return; }
  await dispatch(hash);
}

async function dispatch(hash) {
  const h = hash.split('?')[0];
  // 精确匹配
  let fn = routes[h];
  let params = {};
  if (!fn) {
    // 参数路由 /a/:b
    for (const key of Object.keys(routes)) {
      if (!key.includes('/:')) continue;
      const ps = key.split('/'), as = h.split('/');
      if (ps.length !== as.length) continue;
      let ok = true; const pm = {};
      for (let i = 0; i < ps.length; i++) {
        if (ps[i].startsWith(':')) pm[ps[i].slice(1)] = decodeURIComponent(as[i]);
        else if (ps[i] !== as[i]) { ok = false; break; }
      }
      if (ok) { fn = routes[key]; params = pm; break; }
    }
  }
  if (!fn) { location.hash = state.user.role === 'hq' ? '#/hq/dashboard' : '#/store/dashboard'; return; }
  renderLayout(h);
  try { await fn(params); }
  catch (e) {
    console.error(e);
    setContent(el(`<div class="card empty"><div class="big">⚠️</div>${esc(e.message)}</div>`));
  }
}
window.addEventListener('hashchange', () => { if (state.token) boot(); });

// =====================================================================
//                       总部 · 品牌总览看板
// =====================================================================
route('#/hq/dashboard', async () => {
  setTitle('品牌总览');
  const wrap = el('<div><div class="muted">数据加载中…</div></div>');
  setContent(wrap);
  const d = await api('GET', '/api/dashboard/hq');

  wrap.innerHTML = `
    <div class="grid grid-4">
      <div class="card stat teal"><div class="accent">💰</div>
        <div class="label">今日全品牌营收 <span class="tag green">${d.today.openShiftCount} 个班次进行中</span></div>
        <div class="value">${money(d.today.revenue)}</div>
        <div class="sub">现金 ${money(d.today.cash)} · 刷卡 ${money(d.today.card)} · 会员卡 ${money(d.today.member)}</div>
      </div>
      <div class="card stat amber"><div class="accent">💳</div>
        <div class="label">今日会员充值</div>
        <div class="value">${money(d.today.recharge)}</div>
        <div class="sub">今日接待 ${num(d.today.guests)} 人 · ${num(d.today.orders)} 单</div>
      </div>
      <div class="card stat violet"><div class="accent">📈</div>
        <div class="label">近30天总营收</div>
        <div class="value">${money(d.d30.revenue)}</div>
        <div class="sub">近7天 ${money(d.d7.revenue)} · 近35天 ${money(d.d35.revenue)}</div>
      </div>
      <div class="card stat"><div class="accent">🏬</div>
        <div class="label">品牌规模</div>
        <div class="value">${d.storeCount}<small> 家门店</small></div>
        <div class="sub">在岗技师 ${num(d.employeeCount)} 人 · 会员 ${num(d.memberCount)} 人</div>
      </div>
    </div>

    <div class="section-title">近35天营收与会员充值趋势</div>
    <div class="card" id="trend-card"></div>

    <div class="section-title">门店营收排行（近30天）</div>
    <div class="grid grid-2">
      <div class="card" id="rank-card"><h3>营收排行 <span class="hint">单位：元</span></h3></div>
      <div class="card">
        <h3>今日各门店实时营收 <span class="hint">含未交班次</span></h3>
        <div id="today-rank"></div>
      </div>
    </div>

    <div class="section-title">项目销售结构（近30天）</div>
    <div class="grid grid-2">
      <div class="card"><h3>各品类销售占比</h3><div id="cat-donut"></div></div>
      <div class="card"><h3>收款方式构成 <span class="hint">消费收款</span></h3><div id="pay-bar"></div>
        <div class="mt16 detail-kv">
          <div><div class="k">会员充值总额（30天）</div><div class="v" style="color:#d97706">${money(d.d30.recharge)}</div></div>
          <div><div class="k">充值赠送（30天）</div><div class="v">${money(d.d30.gift)}</div></div>
          <div><div class="k">技师提成（30天）</div><div class="v">${money(d.d30.commission)}</div></div>
          <div><div class="k">会员折扣让利（30天）</div><div class="v">${money(d.d30.discount)}</div></div>
          <div><div class="k">会员卡沉淀余额</div><div class="v" style="color:#7c3aed">${money(d.memberBalance)}</div></div>
          <div><div class="k">总接待人次（30天）</div><div class="v">${num(d.d30.guestCount)}</div></div>
        </div>
      </div>
    </div>

    <div class="section-title">项目销售明细（近30天）</div>
    <div class="card table-wrap">
      <table class="data">
        <thead><tr><th>排名</th><th>项目</th><th>品类</th><th class="num">上钟数</th><th class="num">销售额</th><th class="num">占比</th><th>销售占比</th></tr></thead>
        <tbody id="item-tbody"></tbody>
      </table>
    </div>`;

  const trendData = d.d35.trend.map(x => ({ label: x.date, value: x.revenue }));
  const rechargeData = d.d35.trend.map(x => ({ label: x.date, value: x.recharge }));
  $('#trend-card').appendChild(Charts.lineChart({
    series: [
      { name: '营收', color: '#0f766e', data: trendData },
      { name: '会员充值', color: '#d97706', data: rechargeData }
    ],
    height: 280, yFormat: v => money(v)
  }));

  const rankRows = d.d30.stores.map(s => ({
    label: s.storeName, sub: `${s.city} · ${num(s.guestCount)} 人次 · ${num(s.orders)} 单 · 充值 ${money(s.recharge)}`,
    value: s.revenue
  }));
  $('#rank-card').appendChild(Charts.barRank(rankRows, { format: money }));

  // 今日实时（重新聚合需要明细：用 d35 拿不到今日分门店，改取门店看板过重；用 shifts 接口？hq 可带 storeId 调 dashboard/store）
  const todaySums = await Promise.all(state.meta.stores.map(async s => {
    const sd = await api('GET', `/api/dashboard/store?storeId=${s.id}`);
    return { name: s.name, revenue: sd.today.revenue, recharge: sd.today.recharge, guests: sd.today.guestCount };
  }));
  todaySums.sort((a, b) => b.revenue - a.revenue);
  $('#today-rank').appendChild(Charts.barRank(
    todaySums.map(x => ({ label: x.name, sub: `${num(x.guests)} 人次 · 充值 ${money(x.recharge)}`, value: x.revenue })),
    { format: money, color: '#d97706' }
  ));

  const catRows = d.d30.categories.map((c, i) => ({ label: c.category, value: c.revenue, color: Charts.PALETTE[i] }));
  $('#cat-donut').appendChild(Charts.donut(catRows, { format: money, centerLabel: '30天营收', centerValue: money(d.d30.revenue) }));

  const paySegs = [
    { label: '现金', value: d.d30.cash, color: PAY_COLOR.cash },
    { label: '刷卡', value: d.d30.card, color: PAY_COLOR.card },
    { label: '会员卡', value: d.d30.member, color: PAY_COLOR.member }
  ];
  $('#pay-bar').appendChild(Charts.stackedBar(paySegs, { format: money }));

  const totalItemRev = d.d30.items.reduce((a, b) => a + b.revenue, 0);
  $('#item-tbody').innerHTML = d.d30.items.map((it, i) => `
    <tr>
      <td><span class="rank-no ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span></td>
      <td><b>${esc(it.name)}</b></td>
      <td><span class="tag">${esc(it.category)}</span></td>
      <td class="num">${num(it.qty)}</td>
      <td class="num"><b>${money(it.revenue)}</b></td>
      <td class="num">${pct(it.revenue, totalItemRev)}</td>
      <td style="min-width:140px"><div class="bar-track"><div class="bar-fill" style="width:${(it.revenue / (totalItemRev || 1) * 100).toFixed(1)}%"></div></div></td>
    </tr>`).join('');
});

// =====================================================================
//                       总部 · 项目与统一定价
// =====================================================================
route('#/hq/pricing', async () => {
  setTitle('项目与统一定价');
  await loadMeta();
  const wrap = el('<div></div>');
  setContent(wrap);
  function draw() {
    wrap.innerHTML = `
      <div class="toolbar">
        <span class="muted">总部对全部门店执行统一项目目录与挂牌价；门店按下发价格执行，不得自行改价。</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="add-item">＋ 新增项目</button>
      </div>
      <div class="card table-wrap">
        <table class="data">
          <thead><tr><th>编号</th><th>项目名称</th><th>品类</th><th>时长(分)</th><th class="num">挂牌价</th><th>会员参考价</th><th>状态</th><th>说明</th><th class="right">操作</th></tr></thead>
          <tbody>
            ${state.meta.items.map(i => {
              const mp = state.meta.memberLevels.map(lv => ({ name: lv.name, p: lv.discount >= 1 ? null : Math.round(i.price * lv.discount) }));
              return `<tr>
                <td class="muted">${i.id}</td>
                <td><b>${esc(i.name)}</b></td>
                <td><span class="tag teal">${esc(i.category)}</span></td>
                <td>${i.duration}</td>
                <td class="num" style="font-size:15px;color:#0f766e"><b>${money(i.price)}</b></td>
                <td><span class="tags">${mp.filter(x => x.p !== null).map(x => `<span class="tag">${x.name} ¥${x.p}</span>`).join('')}</span></td>
                <td>${i.active ? '<span class="tag green">在售</span>' : '<span class="tag red">已下架</span>'}</td>
                <td class="muted" style="max-width:220px">${esc(i.description)}</td>
                <td class="right nowrap"><button class="btn btn-sm" data-edit="${i.id}">编辑定价</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    $('#add-item', wrap).addEventListener('click', () => itemModal(null, draw));
    $$('[data-edit]', wrap).forEach(b => b.addEventListener('click', () => itemModal(itemMap().get(b.dataset.edit), draw)));
  }
  draw();
});

function itemModal(item, onSaved) {
  const isEdit = !!item;
  const cats = ['足道', '按摩', '理疗', '特色'];
  const modal = openModal({
    title: isEdit ? `编辑项目 · ${item.name}` : '新增服务项目',
    body: `
      <div class="form-row">
        <div class="field full"><label>项目名称 *</label><input id="f-name" value="${esc(item?.name || '')}"></div>
        <div class="field"><label>品类</label><select id="f-cat">${cats.map(c => `<option ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>时长（分钟）*</label><input id="f-duration" type="number" min="15" step="5" value="${item?.duration ?? 60}"></div>
        <div class="field"><label>挂牌价（元）*</label><input id="f-price" type="number" min="1" value="${item?.price ?? ''}"></div>
        <div class="field"><label>状态</label><select id="f-active"><option value="1" ${item?.active !== false ? 'selected' : ''}>在售</option><option value="0" ${item?.active === false ? 'selected' : ''}>下架</option></select></div>
        <div class="field full"><label>项目说明</label><textarea id="f-desc" rows="2">${esc(item?.description || '')}</textarea></div>
        ${!isEdit ? `<div class="field"><label>销售热度权重（用于经营分析，默认10）</label><input id="f-weight" type="number" value="10"></div>` : ''}
      </div>
      ${isEdit ? `<div class="muted" style="font-size:12.5px">价格调整后对所有门店即时生效；历史单据仍保留成交时价格。</div>` : ''}`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-save">保存并下发全部门店</button>`
  });
  $('#f-save', modal).addEventListener('click', async () => {
    const payload = {
      name: $('#f-name', modal).value.trim(),
      category: $('#f-cat', modal).value,
      duration: Number($('#f-duration', modal).value),
      price: Number($('#f-price', modal).value),
      active: $('#f-active', modal).value === '1',
      description: $('#f-desc', modal).value.trim(),
      weight: Number($('#f-weight', modal)?.value || 10)
    };
    try {
      if (isEdit) await api('PUT', '/api/items/' + item.id, payload);
      else await api('POST', '/api/items', payload);
      await loadMeta(true);
      modal._close(); toast('已保存并同步至全部门店', 'ok'); onSaved && onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// =====================================================================
//                       总部 · 会员体系
// =====================================================================
route('#/hq/membership', async () => {
  setTitle('会员体系');
  await loadMeta();
  const wrap = el('<div></div>');
  setContent(wrap);
  function draw() {
    wrap.innerHTML = `
      <div class="toolbar"><span class="muted">会员等级、专享折扣与充值赠送方案由总部统一制定，全品牌通用。会员累计充值达标后由总部升级。</span></div>
      <div class="grid grid-2" id="level-grid">
        ${state.meta.memberLevels.map(lv => `
          <div class="card">
            <h3><span class="tag violet">${esc(lv.name)}</span><span class="hint">${lv.upgradeAt ? '累计充值满 ' + money(lv.upgradeAt) + ' 升级' : '入门等级'}</span></h3>
            <div class="detail-kv mb12">
              <div><div class="k">消费折扣</div><div class="v" style="color:#7c3aed;font-size:18px">${lv.discount < 1 ? (lv.discount * 10).toFixed(1).replace(/\.0$/, '') + ' 折' : '原价'}</div></div>
              <div><div class="k">充值方案</div><div class="v">${lv.plans.map(p => `${money(p.amount)}送${money(p.gift)}`).join(' / ')}</div></div>
            </div>
            <div class="flex-end"><button class="btn btn-sm" data-edit="${lv.id}">调整折扣 / 充值方案</button></div>
          </div>`).join('')}
      </div>
      <div class="section-title">会员消费折后价一览（按当前定价）</div>
      <div class="card table-wrap">
        <table class="data">
          <thead><tr><th>项目</th><th class="num">挂牌价</th>${state.meta.memberLevels.map(l => `<th class="num">${esc(l.name)}</th>`).join('')}</tr></thead>
          <tbody>
            ${state.meta.items.filter(i => i.active).map(i => `<tr>
              <td><b>${esc(i.name)}</b></td>
              <td class="num">${money(i.price)}</td>
              ${state.meta.memberLevels.map(l => `<td class="num">${l.discount >= 1 ? money(i.price) : money(Math.round(i.price * l.discount))}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    $$('[data-edit]', wrap).forEach(b => b.addEventListener('click', () => levelModal(state.meta.memberLevels.find(l => l.id === b.dataset.edit), draw)));
  }
  draw();
});

function levelModal(lv, onSaved) {
  const modal = openModal({
    title: `调整会员体系 · ${lv.name}`,
    body: `
      <div class="form-row">
        <div class="field"><label>消费折扣（1=不打折，0.85=85折）</label><input id="f-disc" type="number" min="0.5" max="1" step="0.01" value="${lv.discount}"></div>
        <div class="field"><label>升级门槛（累计充值元，0=无）</label><input id="f-up" type="number" step="100" value="${lv.upgradeAt}"></div>
      </div>
      <div class="field"><label>充值赠送方案（每行：充值额,赠送额）</label>
        <textarea id="f-plans" rows="4" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:10px">${lv.plans.map(p => `${p.amount},${p.gift}`).join('\n')}</textarea>
      </div>`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-save">保存</button>`
  });
  $('#f-save', modal).addEventListener('click', async () => {
    const plans = $('#f-plans', modal).value.split('\n').map(line => {
      const [a, g] = line.split(/[,，]/).map(x => Number(String(x).trim()));
      return { amount: a, gift: g || 0 };
    }).filter(p => p.amount > 0);
    try {
      await api('PUT', '/api/member-levels/' + lv.id, {
        discount: Number($('#f-disc', modal).value),
        upgradeAt: Number($('#f-up', modal).value), plans
      });
      await loadMeta(true);
      modal._close(); toast('会员体系已更新并同步全部门店', 'ok'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// =====================================================================
//                       总部 · 技师提成标准
// =====================================================================
route('#/hq/commission', async () => {
  setTitle('技师提成标准');
  await loadMeta();
  const wrap = el('<div></div>');
  setContent(wrap);
  function draw() {
    const levels = state.meta.technicianLevels, items = state.meta.items, rules = state.meta.commissionRules;
    wrap.innerHTML = `
      <div class="toolbar">
        <span class="muted">提成 = 实收金额 × 提成比例。按「项目 × 技师等级」矩阵统一定制，比例修改保存后对全品牌门店生效（历史单据不变）。</span>
        <span class="spacer"></span>
        <button class="btn" id="reset-rules">恢复各等级基准比例</button>
        <button class="btn btn-primary" id="save-rules">保存提成标准</button>
      </div>
      <div class="card table-wrap">
        <table class="data" id="rule-table">
          <thead><tr><th>项目</th><th class="num">挂牌价</th>${levels.map(l => `<th class="num">${esc(l.name)}</th>`).join('')}</tr></thead>
          <tbody>
            ${items.map(it => `<tr data-item="${it.id}">
              <td><b>${esc(it.name)}</b><br/><span class="muted" style="font-size:12px">${esc(it.category)} · ${it.duration}分钟</span></td>
              <td class="num">${money(it.price)}</td>
              ${levels.map(lv => {
                const r = rules.find(r => r.itemId === it.id && r.technicianLevelId === lv.id);
                return `<td class="num"><input type="number" min="0" max="100" style="width:72px;text-align:right" data-lv="${lv.id}" value="${r?.rate ?? 0}"> %</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="section-title">提成示例（按当前比例试算）</div>
      <div class="card table-wrap">
        <table class="data">
          <thead><tr><th>场景</th>${levels.map(l => `<th class="num">${esc(l.name)}</th>`).join('')}</tr></thead>
          <tbody>
            ${items.slice(0, 4).map(it => `<tr>
              <td>${esc(it.name)} · 现金挂牌价 ${money(it.price)}</td>
              ${levels.map(lv => {
                const r = rules.find(r => r.itemId === it.id && r.technicianLevelId === lv.id);
                return `<td class="num">${money(Math.round(it.price * (r?.rate || 0) / 100))}</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    $('#save-rules', wrap).addEventListener('click', async () => {
      const rulesPayload = [];
      $$('#rule-table tbody tr', wrap).forEach(tr => {
        const itemId = tr.dataset.item;
        $$('input[data-lv]', tr).forEach(inp => rulesPayload.push({ itemId, technicianLevelId: inp.dataset.lv, rate: Number(inp.value) }));
      });
      try {
        await api('PUT', '/api/commission-rules', { rules: rulesPayload });
        await loadMeta(true); toast('提成标准已统一下发', 'ok'); draw();
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#reset-rules', wrap).addEventListener('click', () => {
      const base = { L1: 25, L2: 30, L3: 35, L4: 42 };
      $$('#rule-table tbody tr', wrap).forEach(tr => {
        const itemId = tr.dataset.item;
        const adj = { P05: 5, P06: 5, P07: -5, P08: -3 }[itemId] || 0;
        $$('input[data-lv]', tr).forEach(inp => { inp.value = base[inp.dataset.lv] + adj; });
      });
      toast('已填入基准比例，记得点保存');
    });
  }
  draw();
});

// =====================================================================
//                       总部 · 门店管理
// =====================================================================
route('#/hq/stores', async () => {
  setTitle('门店管理');
  const wrap = el('<div><div class="muted">加载中…</div></div>');
  setContent(wrap);
  const stores = await api('GET', '/api/stores');
  wrap.innerHTML = `
    <div class="toolbar">
      <span class="muted">开立新店时同步生成门店店长账号，用于门店端登录交班收银。</span>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="add-store">＋ 开立新门店</button>
    </div>
    <div class="grid grid-3" id="store-grid">
      ${stores.map(s => `
        <div class="card">
          <h3>${esc(s.name)} ${s.status === 'closed' ? '<span class="tag red">已停业</span>' : '<span class="tag green">营业中</span>'}</h3>
          <div class="detail-kv" style="grid-template-columns:1fr 1fr">
            <div><div class="k">城市</div><div class="v">${esc(s.city)}</div></div>
            <div><div class="k">店长</div><div class="v">${esc(s.manager)}</div></div>
            <div><div class="k">开业日期</div><div class="v">${s.openedAt}</div></div>
            <div><div class="k">联系电话</div><div class="v">${esc(s.phone || '—')}</div></div>
            <div class="full"><div class="k">地址</div><div class="v">${esc(s.address || '—')}</div></div>
            <div><div class="k">在岗技师</div><div class="v">${num(s.employeeCount)} 人</div></div>
            <div><div class="k">本店会员</div><div class="v">${num(s.memberCount)} 人</div></div>
          </div>
          <div class="flex-end mt16"><button class="btn btn-sm" data-edit="${s.id}">编辑门店</button></div>
        </div>`).join('')}
    </div>`;
  $('#add-store', wrap).addEventListener('click', () => storeModal(null, async () => { await loadMeta(true); routes['#/hq/stores'](); }));
  $$('[data-edit]', wrap).forEach(b => b.addEventListener('click', () => storeModal(stores.find(s => s.id === b.dataset.edit), async () => { await loadMeta(true); routes['#/hq/stores'](); })));
});

function storeModal(store, onSaved) {
  const isEdit = !!store;
  const modal = openModal({
    title: isEdit ? '编辑门店' : '开立新门店',
    body: `
      <div class="form-row">
        <div class="field full"><label>门店名称 *</label><input id="f-name" value="${esc(store?.name || '')}"></div>
        <div class="field"><label>城市 *</label><input id="f-city" value="${esc(store?.city || '')}"></div>
        <div class="field"><label>店长 *</label><input id="f-manager" value="${esc(store?.manager || '')}"></div>
        <div class="field"><label>联系电话</label><input id="f-phone" value="${esc(store?.phone || '')}"></div>
        <div class="field"><label>开业日期</label><input id="f-open" type="date" value="${store?.openedAt || today()}"></div>
        <div class="field full"><label>地址</label><input id="f-addr" value="${esc(store?.address || '')}"></div>
        ${!isEdit ? `<div class="field"><label>门店登录账号</label><input id="f-user" placeholder="留空自动生成"></div>
        <div class="field"><label>初始密码</label><input id="f-pwd" value="123456"></div>` :
        `<div class="field"><label>营业状态</label><select id="f-status"><option value="open" ${store?.status === 'open' ? 'selected' : ''}>营业中</option><option value="closed" ${store?.status === 'closed' ? 'selected' : ''}>停业</option></select></div>`}
      </div>`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-save">${isEdit ? '保存' : '开立门店并生成账号'}</button>`
  });
  $('#f-save', modal).addEventListener('click', async () => {
    const get = id => $(id, modal).value.trim();
    try {
      if (isEdit) {
        await api('PUT', '/api/stores/' + store.id, {
          name: get('#f-name'), city: get('#f-city'), manager: get('#f-manager'),
          phone: get('#f-phone'), address: get('#f-addr'), openedAt: get('#f-open'),
          status: $('#f-status', modal)?.value
        });
      } else {
        await api('POST', '/api/stores', {
          name: get('#f-name'), city: get('#f-city'), manager: get('#f-manager'),
          phone: get('#f-phone'), address: get('#f-addr'), openedAt: get('#f-open'),
          username: get('#f-user') || undefined, password: get('#f-pwd') || '123456'
        });
      }
      modal._close(); toast('已保存', 'ok'); onSaved && onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// =====================================================================
//                       技师档案（总部/门店共用）
// =====================================================================
function employeesPage(scope) {
  return async () => {
    setTitle(scope === 'hq' ? '技师档案' : '本店技师');
    await loadMeta();
    const wrap = el('<div><div class="muted">加载中…</div></div>');
    setContent(wrap);
    let filterStatus = 'active';

    async function draw() {
      const qs = new URLSearchParams();
      if (scope !== 'hq') qs.set('storeId', state.user.storeId);
      if (filterStatus !== 'all') qs.set('status', filterStatus);
      const list = await api('GET', '/api/employees?' + qs.toString());
      wrap.innerHTML = `
        <div class="toolbar">
          <select class="filter" id="f-status">
            <option value="active" ${filterStatus === 'active' ? 'selected' : ''}>在职</option>
            <option value="resigned" ${filterStatus === 'resigned' ? 'selected' : ''}>已离职</option>
            <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>全部</option>
          </select>
          <span class="muted">共 ${list.length} 人 · 在职 ${list.filter(e => e.status === 'active').length} 人</span>
          <span class="spacer"></span>
          <button class="btn btn-primary" id="add-emp">＋ 入职登记</button>
        </div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>工号</th><th>姓名</th><th>性别</th>${scope === 'hq' ? '<th>所属门店</th>' : ''}<th>等级</th><th>擅长项目</th><th>入职日期</th><th>状态</th><th class="right">操作</th></tr></thead>
            <tbody>
              ${list.length === 0 ? `<tr><td colspan="9"><div class="empty">暂无技师</div></td></tr>` : list.map(e => `
                <tr>
                  <td class="muted">${e.code}</td>
                  <td><b>${esc(e.name)}</b></td>
                  <td>${e.gender}</td>
                  ${scope === 'hq' ? `<td style="font-size:12.5px">${esc(e.storeName)}</td>` : ''}
                  <td><span class="tag ${e.levelId === 'L4' ? 'violet' : 'teal'}">${esc(e.levelName)}</span></td>
                  <td><span class="tags">${e.skilledNames.slice(0, 4).map(x => `<span class="tag">${esc(x)}</span>`).join('')}${e.skilledNames.length > 4 ? `<span class="tag">+${e.skilledNames.length - 4}</span>` : ''}</span></td>
                  <td>${e.hireDate}</td>
                  <td>${e.status === 'active' ? '<span class="tag green">在职</span>' : `<span class="tag red">已离职 ${esc(e.leaveDate || '')}</span>`}</td>
                  <td class="right nowrap">
                    <button class="btn btn-sm" data-view="${e.id}">档案</button>
                    ${e.status === 'active' ? `<button class="btn btn-sm" data-edit="${e.id}">编辑</button>
                      ${scope === 'hq' ? `<button class="btn btn-sm" data-move="${e.id}">调动</button>` : ''}
                      <button class="btn btn-sm btn-danger" data-resign="${e.id}">离职</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      $('#f-status', wrap).addEventListener('change', (e) => { filterStatus = e.target.value; draw(); });
      $('#add-emp', wrap).addEventListener('click', () => employeeModal(null, scope, draw));
      $$('[data-view]', wrap).forEach(b => b.addEventListener('click', () => employeeDetail(list.find(e => e.id === b.dataset.view), scope)));
      $$('[data-edit]', wrap).forEach(b => b.addEventListener('click', () => employeeModal(list.find(e => e.id === b.dataset.edit), scope, draw)));
      $$('[data-move]', wrap).forEach(b => b.addEventListener('click', () => transferModal(list.find(e => e.id === b.dataset.move), draw)));
      $$('[data-resign]', wrap).forEach(b => b.addEventListener('click', () => {
        const e = list.find(x => x.id === b.dataset.resign);
        resignModal(e, draw);
      }));
    }
    draw();
  };
}
route('#/hq/employees', employeesPage('hq'));
route('#/store/employees', employeesPage('store'));

function skillCheckboxes(selected) {
  return `<div class="checkbox-grid">${state.meta.items.map(i =>
    `<label><input type="checkbox" name="skill" value="${i.id}" ${selected.includes(i.id) ? 'checked' : ''}>${esc(i.name)}</label>`).join('')}</div>`;
}

function employeeModal(emp, scope, onSaved) {
  const isEdit = !!emp;
  const stores = state.meta.stores;
  const modal = openModal({
    title: isEdit ? `编辑技师 · ${emp.name}` : '技师入职登记',
    wide: true,
    body: `
      <div class="form-row">
        <div class="field"><label>姓名 *</label><input id="f-name" value="${esc(emp?.name || '')}"></div>
        <div class="field"><label>性别</label><select id="f-gender"><option ${emp?.gender !== '女' ? 'selected' : ''}>男</option><option ${emp?.gender === '女' ? 'selected' : ''}>女</option></select></div>
        <div class="field"><label>手机号</label><input id="f-phone" value="${esc(emp?.phone || '')}"></div>
        <div class="field"><label>技师等级 *</label><select id="f-level">
          ${state.meta.technicianLevels.map(l => `<option value="${l.id}" ${emp?.levelId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
        </select></div>
        ${scope === 'hq' ? `<div class="field"><label>${isEdit ? '所属门店（调动请到调动功能）' : '入职门店 *'}</label>
          <select id="f-store" ${isEdit ? 'disabled' : ''}>${stores.map(s => `<option value="${s.id}" ${emp?.storeId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>${isEdit ? '入职日期' : '入职日期 *'}</label><input id="f-hire" type="date" value="${emp?.hireDate || today()}"></div>
        <div class="field full"><label>擅长项目（可多选，决定可派工项目）</label>${skillCheckboxes(emp?.skilledItems || [])}</div>
        <div class="field full"><label>备注</label><input id="f-remark" value="${esc(emp?.remark || '')}"></div>
        ${!isEdit ? `
        <div class="field full"><label>培训 / 考核记录（可多条，每条一行：名称,结果,日期YYYY-MM-DD）</label>
          <textarea id="f-train" rows="3" placeholder="新员工入职培训,合格,2026-09-19"></textarea></div>` : ''}
      </div>`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-save">${isEdit ? '保存' : '办理入职'}</button>`
  });
  $('#f-save', modal).addEventListener('click', async () => {
    const payload = {
      name: $('#f-name', modal).value.trim(),
      gender: $('#f-gender', modal).value,
      phone: $('#f-phone', modal).value.trim(),
      levelId: $('#f-level', modal).value,
      hireDate: $('#f-hire', modal).value,
      skilledItems: $$('input[name=skill]:checked', modal).map(x => x.value),
      remark: $('#f-remark', modal).value.trim()
    };
    if (scope === 'hq' && !isEdit) payload.storeId = $('#f-store', modal).value;
    if (!isEdit) {
      payload.trainings = $('#f-train', modal).value.split('\n').map(line => {
        const [name, result, date] = line.split(/[,，]/).map(x => x?.trim());
        return name ? { name, result: result || '合格', date: date || today(), content: '' } : null;
      }).filter(Boolean);
    }
    try {
      if (isEdit) await api('PUT', '/api/employees/' + emp.id, payload);
      else await api('POST', '/api/employees', payload);
      modal._close(); toast(isEdit ? '档案已更新' : '入职登记成功', 'ok'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function employeeDetail(emp, scope) {
  const modal = openModal({
    title: `技师档案 · ${emp.name}（${emp.code}）`, wide: true,
    body: `
      <div class="detail-kv">
        <div><div class="k">姓名</div><div class="v">${esc(emp.name)}</div></div>
        <div><div class="k">性别</div><div class="v">${emp.gender}</div></div>
        <div><div class="k">电话</div><div class="v">${esc(emp.phone || '—')}</div></div>
        <div><div class="k">等级</div><div class="v">${esc(emp.levelName)}</div></div>
        <div><div class="k">所属门店</div><div class="v">${esc(emp.storeName)}</div></div>
        <div><div class="k">入职日期</div><div class="v">${emp.hireDate}</div></div>
        <div><div class="k">状态</div><div class="v">${emp.status === 'active' ? '在职' : '已离职 ' + esc(emp.leaveDate || '')}</div></div>
        <div><div class="k">备注</div><div class="v">${esc(emp.remark || '—')}</div></div>
        <div class="full"><div class="k">擅长项目</div><div class="tags mt16">${emp.skilledNames.map(x => `<span class="tag teal">${esc(x)}</span>`).join('')}</div></div>
      </div>
      <div class="section-title">培训 / 考核记录 <button class="btn btn-sm" id="add-train" style="margin-left:10px">＋ 新增记录</button></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>日期</th><th>培训/考核名称</th><th>内容</th><th>考核结果</th></tr></thead>
          <tbody id="train-body">
            ${emp.trainings.length === 0 ? '<tr><td colspan="4"><div class="empty">暂无培训记录</div></td></tr>' :
              emp.trainings.map(t => `<tr><td class="nowrap">${t.date}</td><td><b>${esc(t.name)}</b></td><td class="muted">${esc(t.content || '—')}</td>
                <td><span class="tag ${t.result === '优秀' ? 'violet' : t.result === '良好' ? 'amber' : 'green'}">${esc(t.result)}</span></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${emp.transferHistory.length ? `<div class="section-title">调动记录</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th>调出门店</th><th>调入门店</th><th>原因</th></tr></thead><tbody>
          ${emp.transferHistory.map(t => `<tr><td>${t.date}</td><td>${esc(storeName(t.fromStoreId))}</td><td>${esc(storeName(t.toStoreId))}</td><td>${esc(t.reason)}</td></tr>`).join('')}
        </tbody></table></div>` : ''}`,
    footer: `<button class="btn" data-close>关闭</button>`
  });
  $('#add-train', modal).addEventListener('click', () => {
    const m2 = openModal({
      title: '新增培训 / 考核记录',
      body: `
        <div class="field"><label>名称 *</label><input id="t-name" placeholder="如：足底反射区进阶"></div>
        <div class="field"><label>内容</label><textarea id="t-content" rows="2"></textarea></div>
        <div class="form-row">
          <div class="field"><label>考核结果</label><select id="t-result"><option>合格</option><option>良好</option><option>优秀</option><option>不合格</option></select></div>
          <div class="field"><label>日期 *</label><input id="t-date" type="date" value="${today()}"></div>
        </div>`,
      footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="t-save">保存</button>`
    });
    $('#t-save', m2).addEventListener('click', async () => {
      try {
        await api('POST', `/api/employees/${emp.id}/trainings`, {
          name: $('#t-name', m2).value.trim(), content: $('#t-content', m2).value.trim(),
          result: $('#t-result', m2).value, date: $('#t-date', m2).value
        });
        m2._close(); modal._close(); toast('培训记录已登记', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function transferModal(emp, onSaved) {
  const modal = openModal({
    title: `技师跨店调动 · ${emp.name}`,
    body: `
      <div class="mb12" style="background:#f8fafc;border-radius:9px;padding:10px 14px;font-size:13px">
        当前所属：<b>${esc(storeName(emp.storeId))}</b> · ${esc(emp.levelName)}
      </div>
      <div class="form-row">
        <div class="field"><label>调入门店 *</label><select id="f-to">
          ${state.meta.stores.filter(s => s.id !== emp.storeId).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>
        <div class="field"><label>调动生效日期 *</label><input id="f-date" type="date" value="${today()}"></div>
        <div class="field full"><label>调动原因</label><select id="f-reason">
          <option>门店人员调配</option><option>支援新店开业</option><option>员工个人申请</option><option>业务能力匹配</option>
        </select></div>
      </div>
      <div class="muted" style="font-size:12.5px">调动立即生效，技师归属调入门店并可在该店排班派工；调动双方门店均可在调动记录中追溯。</div>`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-ok">确认调动</button>`
  });
  $('#f-ok', modal).addEventListener('click', async () => {
    try {
      await api('POST', `/api/employees/${emp.id}/transfer`, {
        toStoreId: $('#f-to', modal).value, date: $('#f-date', modal).value, reason: $('#f-reason', modal).value
      });
      modal._close(); toast('调动已生效', 'ok'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function resignModal(emp, onSaved) {
  const modal = openModal({
    title: `技师离职办理 · ${emp.name}`,
    body: `
      <div class="field"><label>离职日期</label><input id="f-date" type="date" value="${today()}"></div>
      <div class="field"><label>离职原因</label><select id="f-reason"><option>个人原因</option><option>家庭原因</option><option>合同到期</option><option>其他</option></select></div>
      <div class="muted" style="font-size:12.5px">离职后不可再派工上钟，档案与历史提成、上钟明细保留可查。</div>`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-danger" id="f-ok">确认离职</button>`
  });
  $('#f-ok', modal).addEventListener('click', async () => {
    try {
      await api('POST', `/api/employees/${emp.id}/resign`, { date: $('#f-date', modal).value, reason: $('#f-reason', modal).value });
      modal._close(); toast('离职办理完成', 'ok'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ---------------- 调动记录 ----------------
function transfersPage(scope) {
  return async () => {
    setTitle('调动记录');
    await loadMeta();
    const list = await api('GET', '/api/transfers');
    const wrap = el(`
      <div>
        <div class="toolbar"><span class="muted">${scope === 'hq' ? '总部可在技师档案中发起跨店调动；此处展示全品牌调动台账。' : '本店调入 / 调出记录'}</span></div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>调动日期</th><th>技师</th><th>调出门店</th><th></th><th>调入门店</th><th>调动原因</th></tr></thead>
            <tbody>${list.length === 0 ? '<tr><td colspan="6"><div class="empty">暂无调动记录</div></td></tr>' :
              list.map(t => `<tr>
                <td class="nowrap">${t.date}</td>
                <td><b>${esc(t.employeeName)}</b></td>
                <td>${esc(t.fromStoreName)}</td>
                <td class="muted">→</td>
                <td><span class="tag teal">${esc(t.toStoreName)}</span></td>
                <td>${esc(t.reason)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`);
    setContent(wrap);
  };
}
route('#/hq/transfers', transfersPage('hq'));
route('#/store/transfers', transfersPage('store'));

// =====================================================================
//                       会员名册（总部/门店）
// =====================================================================
function membersPage(scope) {
  return async () => {
    setTitle(scope === 'hq' ? '会员名册' : '会员管理');
    await loadMeta();
    const wrap = el('<div><div class="muted">加载中…</div></div>');
    setContent(wrap);
    let kw = '', lvFilter = '';

    async function draw() {
      const qs = new URLSearchParams();
      if (scope !== 'hq') qs.set('storeId', state.user.storeId);
      if (kw) qs.set('q', kw);
      if (lvFilter) qs.set('levelId', lvFilter);
      const list = await api('GET', '/api/members?' + qs.toString());
      wrap.innerHTML = `
        <div class="toolbar">
          <div class="search-box"><input id="f-q" placeholder="姓名 / 卡号 / 手机号" value="${esc(kw)}"></div>
          <select class="filter" id="f-lv">
            <option value="">全部等级</option>
            ${state.meta.memberLevels.map(l => `<option value="${l.id}" ${lvFilter === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
          </select>
          <span class="spacer"></span>
          <button class="btn btn-primary" id="add-member">＋ 新开卡</button>
        </div>
        <div class="grid grid-4 mb12">
          ${state.meta.memberLevels.map(l => {
            const n = list.filter(m => m.levelId === l.id).length;
            return `<div class="card stat" style="padding:13px 16px"><div class="label" style="font-size:12px">${esc(l.name)}</div><div class="value" style="font-size:21px">${n}<small> 人</small></div></div>`;
          }).join('')}
        </div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>卡号</th><th>姓名</th><th>性别</th><th>手机号</th><th>等级</th>${scope === 'hq' ? '<th>办卡门店</th>' : ''}<th class="num">余额</th><th class="num">累计充值</th><th>办卡日期</th><th class="right">操作</th></tr></thead>
            <tbody>${list.length === 0 ? '<tr><td colspan="10"><div class="empty">没有匹配的会员</div></td></tr>' :
              list.map(m => `<tr>
                <td class="muted">${m.cardNo}</td>
                <td><b>${esc(m.name)}</b></td>
                <td>${m.gender}</td>
                <td>${esc(m.phone)}</td>
                <td><span class="tag ${m.levelId === 'V4' ? 'violet' : m.levelId === 'V3' ? 'amber' : 'teal'}">${esc(m.levelName)}</span></td>
                ${scope === 'hq' ? `<td style="font-size:12.5px">${esc(m.homeStoreName)}</td>` : ''}
                <td class="num" style="color:#7c3aed"><b>${money(m.balance)}</b></td>
                <td class="num">${money(m.totalRecharge)}</td>
                <td>${m.cardOpenDate}</td>
                <td class="right nowrap"><button class="btn btn-sm" data-ledger="${m.id}">账户明细</button>
                  ${scope === 'hq' ? `<button class="btn btn-sm" data-level="${m.id}">调级</button>` : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      const qInput = $('#f-q', wrap);
      qInput.addEventListener('keydown', e => { if (e.key === 'Enter') { kw = qInput.value.trim(); draw(); } });
      $('#f-lv', wrap).addEventListener('change', e => { lvFilter = e.target.value; draw(); });
      $('#add-member', wrap).addEventListener('click', () => memberModal(scope, draw));
      $$('[data-ledger]', wrap).forEach(b => b.addEventListener('click', () => ledgerModal(b.dataset.ledger)));
      $$('[data-level]', wrap).forEach(b => b.addEventListener('click', () => {
        const m = list.find(x => x.id === b.dataset.level);
        const modal = openModal({
          title: `会员等级调整 · ${m.name}`,
          body: `<div class="field"><label>新等级</label><select id="f-lv2">
            ${state.meta.memberLevels.map(l => `<option value="${l.id}" ${m.levelId === l.id ? 'selected' : ''}>${esc(l.name)}（${l.discount < 1 ? (l.discount * 10).toFixed(1) + '折' : '原价'}）</option>`).join('')}
          </select></div>`,
          footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-ok">确认调级</button>`
        });
        $('#f-ok', modal).addEventListener('click', async () => {
          try { await api('PUT', `/api/members/${m.id}/level`, { levelId: $('#f-lv2', modal).value }); modal._close(); toast('等级已调整', 'ok'); draw(); }
          catch (e) { toast(e.message, 'error'); }
        });
      }));
    }
    draw();
  };
}
route('#/hq/members', membersPage('hq'));
route('#/store/members', membersPage('store'));

function memberModal(scope, onSaved) {
  const modal = openModal({
    title: '新开会员卡',
    body: `
      <div class="form-row">
        <div class="field"><label>姓名 *</label><input id="f-name"></div>
        <div class="field"><label>性别</label><select id="f-gender"><option>女</option><option>男</option></select></div>
        <div class="field"><label>手机号 *</label><input id="f-phone" maxlength="11"></div>
        <div class="field"><label>初始等级</label><select id="f-lv">
          ${state.meta.memberLevels.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}
        </select></div>
        ${scope === 'hq' ? `<div class="field full"><label>办卡门店 *</label><select id="f-store">${state.meta.stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>` : ''}
      </div>
      <div class="muted" style="font-size:12.5px">开卡后可在「交班工作台 → 会员充值」按所选等级的充值方案充值并获赠金额。</div>`,
    footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-ok">开卡</button>`
  });
  $('#f-ok', modal).addEventListener('click', async () => {
    try {
      const payload = {
        name: $('#f-name', modal).value.trim(), gender: $('#f-gender', modal).value,
        phone: $('#f-phone', modal).value.trim(), levelId: $('#f-lv', modal).value
      };
      if (scope === 'hq') payload.homeStoreId = $('#f-store', modal).value;
      else payload.homeStoreId = state.user.storeId;
      const m = await api('POST', '/api/members', payload);
      modal._close(); toast(`开卡成功，卡号 ${m.cardNo}`, 'ok'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function ledgerModal(id) {
  const d = await api('GET', `/api/members/${id}/ledger`);
  const m = d.member;
  openModal({
    title: `会员账户明细 · ${m.name}（${m.cardNo}）`, wide: true,
    body: `
      <div class="detail-kv mb12">
        <div><div class="k">等级</div><div class="v">${esc(m.levelName)}</div></div>
        <div><div class="k">当前余额</div><div class="v" style="color:#7c3aed">${money(m.balance)}</div></div>
        <div><div class="k">累计充值</div><div class="v">${money(m.totalRecharge)}</div></div>
        <div><div class="k">手机号</div><div class="v">${esc(m.phone)}</div></div>
      </div>
      <div class="section-title">充值记录</div>
      <div class="table-wrap mb12"><table class="data">
        <thead><tr><th>日期</th><th>时间</th><th>门店</th><th class="num">充值</th><th class="num">赠送</th><th>收款</th><th>经手人</th></tr></thead>
        <tbody>${d.recharges.length === 0 ? '<tr><td colspan="7" class="empty">暂无充值</td></tr>' :
          d.recharges.slice(0, 20).map(r => `<tr><td class="nowrap">${r.date}</td><td>${r.time}</td><td style="font-size:12px">${esc(r.storeName)}</td>
            <td class="num"><b style="color:#d97706">+${money(r.amount)}</b></td><td class="num">+${money(r.gift)}</td>
            <td>${PAY_LABEL[r.payMethod]}</td><td>${esc(r.operator)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="section-title">会员卡消费记录</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>日期</th><th>时间</th><th>门店</th><th>项目</th><th class="num">扣款</th></tr></thead>
        <tbody>${d.consumes.length === 0 ? '<tr><td colspan="5" class="empty">暂无会员卡消费</td></tr>' :
          d.consumes.slice(0, 20).map(r => `<tr><td class="nowrap">${r.date}</td><td>${r.time}</td><td style="font-size:12px">${esc(r.storeName)}</td>
            <td>${esc(r.itemName)}</td><td class="num" style="color:#7c3aed">-${money(r.amount)}</td></tr>`).join('')}</tbody>
      </table></div>`,
    footer: `<button class="btn" data-close>关闭</button>`
  });
}

// =====================================================================
//                       门店端 · 门店看板
// =====================================================================
route('#/store/dashboard', async () => {
  setTitle('门店看板');
  const wrap = el('<div><div class="muted">加载中…</div></div>');
  setContent(wrap);
  const d = await api('GET', '/api/dashboard/store');
  const s = d.store;
  wrap.innerHTML = `
    <div class="toolbar">
      <div><b style="font-size:16px">${esc(s.name)}</b> <span class="tag teal">${esc(s.city)}</span></div>
      <div class="muted" style="font-size:12.5px">${esc(s.address)} · 店长 ${esc(s.manager)} ${esc(s.phone)}</div>
      <span class="spacer"></span>
      ${d.openShift ? '<span class="tag amber">晚班进行中</span>' : '<span class="tag green">今日班次均已交接</span>'}
      <a class="btn btn-primary btn-sm" href="#/store/shift">前往交班工作台 →</a>
    </div>

    <div class="grid grid-4">
      <div class="card stat teal"><div class="label">今日营收（含在班）</div><div class="value">${money(d.today.revenue)}</div><div class="sub">${num(d.today.guestCount)} 人次 · ${num(d.today.orderCount)} 单</div></div>
      <div class="card stat amber"><div class="label">今日会员充值</div><div class="value">${money(d.today.recharge)}</div><div class="sub">现金充值 ${money(d.today.cashRecharge)} · 刷卡充值 ${money(d.today.cardRecharge)}</div></div>
      <div class="card stat violet"><div class="label">近7天营收</div><div class="value">${money(d.d7.revenue)}</div><div class="sub">提成 ${money(d.d7.commission)}</div></div>
      <div class="card stat"><div class="label">近30天营收</div><div class="value">${money(d.d30.revenue)}</div><div class="sub">本店技师 ${d.employeeCount} 人 · 会员 ${d.memberCount} 人</div></div>
    </div>

    <div class="section-title">近30天营收 / 充值趋势</div>
    <div class="card" id="trend"></div>

    <div class="grid grid-2 mt16">
      <div class="card"><h3>收款构成（近30天）</h3><div id="pay"></div></div>
      <div class="card"><h3>近期交班报表</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>日期</th><th>班次</th><th>状态</th><th class="num">营收</th><th></th></tr></thead>
          <tbody>${d.recent.map(sh => `<tr>
            <td>${sh.date}</td><td>${SHIFT_LABEL[sh.shift]}</td>
            <td>${sh.status === 'closed' ? '<span class="tag green">已交接</span>' : '<span class="tag amber">进行中</span>'}</td>
            <td class="num"><b>${money(sh.totals.totalSales)}</b></td>
            <td class="right"><a class="btn btn-sm" href="#/store/shifts">查看</a></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>`;
  $('#trend', wrap).appendChild(Charts.lineChart({
    series: [
      { name: '营收', color: '#0f766e', data: d.d30.trend.map(x => ({ label: x.date, value: x.revenue })) },
      { name: '充值', color: '#d97706', data: d.d30.trend.map(x => ({ label: x.date, value: x.recharge })) }
    ], height: 260, yFormat: money
  }));
  $('#pay', wrap).appendChild(Charts.stackedBar([
    { label: '现金', value: d.d30.cash, color: PAY_COLOR.cash },
    { label: '刷卡', value: d.d30.card, color: PAY_COLOR.card },
    { label: '会员卡', value: d.d30.member, color: PAY_COLOR.member }
  ], { format: money }));
});

// =====================================================================
//                       门店端 · 交班工作台
// =====================================================================
route('#/store/shift', async () => {
  setTitle('交班工作台');
  const wrap = el('<div><div class="muted">加载中…</div></div>');
  setContent(wrap);

  async function getOpen() {
    const d = await api('GET', '/api/dashboard/store');
    return d.openShift;
  }

  async function drawStart() {
    const [open, todayShifts] = await Promise.all([
      getOpen(),
      api('GET', '/api/shifts?from=' + today() + '&to=' + today())
    ]);
    if (open) return drawShift(open.id);
    const closedToday = todayShifts.filter(s => s.status === 'closed');
    const existOpen = todayShifts.find(s => s.status === 'open');
    const t = new Date().getHours();
    const suggest = t >= 16 ? 'evening' : 'morning';
    wrap.innerHTML = `
      ${closedToday.length ? `
      <div class="section-title">今日已交接班次</div>
      <div class="card table-wrap mb12">
        <table class="data"><thead><tr><th>班次</th><th>交班人</th><th>接班人</th><th class="num">接待</th><th class="num">现金</th><th class="num">刷卡</th><th class="num">会员卡</th><th class="num">营收</th><th class="num">充值</th><th class="right">报表</th></tr></thead>
        <tbody>${closedToday.map(s => `<tr>
          <td>${SHIFT_LABEL[s.shift]}</td><td>${esc(s.openerName)}</td><td>${esc(s.closerName)}</td>
          <td class="num">${num(s.totals.guestCount)}</td>
          <td class="num">${money(s.totals.cashSales)}</td>
          <td class="num">${money(s.totals.cardSales)}</td>
          <td class="num">${money(s.totals.memberSales)}</td>
          <td class="num"><b>${money(s.totals.totalSales)}</b></td>
          <td class="num">${money(s.totals.totalRecharge)}</td>
          <td class="right"><button class="btn btn-sm" data-report="${s.id}">查看 / 打印</button></td>
        </tr>`).join('')}</tbody></table>
      </div>` : ''}
      <div class="card" style="max-width:560px;margin:${closedToday.length ? '0 auto 30px' : '30px auto'}">
        <h3>${closedToday.length ? '开下一个班次' : '开班 / 接班登记'}</h3>
        <p class="muted mb12" style="font-size:13px">${existOpen ? '当前有进行中的班次，正在打开…' : '当前没有进行中的班次。开班后即可登记上钟单与会员充值，收班时由交班双方签字确认锁定。'}</p>
        <div class="form-row">
          <div class="field"><label>班次</label><select id="f-shift">
            <option value="morning" ${suggest === 'morning' ? 'selected' : ''}>白班（10:00–16:00）</option>
            <option value="evening" ${suggest === 'evening' ? 'selected' : ''}>晚班（16:20–23:30）</option>
          </select></div>
          <div class="field"><label>交班日期</label><input id="f-date" type="date" value="${today()}"></div>
          <div class="field full"><label>本班责任人（交班人）</label><input id="f-opener" value="${esc(state.user.name)}"></div>
          <div class="field full"><label>备注</label><input id="f-note" placeholder="备用金、异常情况等（选填）"></div>
        </div>
        <div class="flex-end"><button class="btn btn-primary" id="f-open">开 班</button></div>
      </div>`;
    $$('[data-report]', wrap).forEach(b => b.addEventListener('click', () => shiftReportModal(b.dataset.report)));
    $('#f-open', wrap).addEventListener('click', async () => {
      try {
        const sh = await api('POST', '/api/shifts', {
          shift: $('#f-shift', wrap).value, date: $('#f-date', wrap).value,
          openerName: $('#f-opener', wrap).value.trim(), note: $('#f-note', wrap).value
        });
        toast('已开班', 'ok'); drawShift(sh.id);
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function drawShift(id) {
    const sh = await api('GET', '/api/shifts/detail?id=' + id);
    const locked = sh.status === 'closed';
    const t = sh.totals;
    wrap.innerHTML = `
      <div class="print-title"><h2>御足堂 · 交班报表</h2></div>
      <div class="card mb12 shift-head">
        <div><b style="font-size:16px">${esc(storeName(sh.storeId))}</b></div>
        <span class="tag teal">${sh.date} ${SHIFT_LABEL[sh.shift]}</span>
        ${locked ? '<span class="tag green">✓ 已双方签字锁定</span>' : '<span class="tag amber">⏱ 进行中</span>'}
        <span class="muted" style="font-size:12.5px">开班 ${new Date(sh.openedAt).toLocaleString('zh-CN')}${sh.closedAt ? ' · 收班 ' + new Date(sh.closedAt).toLocaleString('zh-CN') : ''}</span>
        <span class="spacer" style="flex:1"></span>
        ${locked ? '<button class="btn btn-sm no-print" id="btn-print">🖨 打印报表</button>' : `
        <button class="btn btn-sm btn-amber no-print" id="btn-order">＋ 登记上钟</button>
        <button class="btn btn-sm no-print" id="btn-recharge">＋ 会员充值</button>
        <button class="btn btn-sm btn-primary no-print" id="btn-close">✍ 交班签字</button>`}
      </div>

      <div class="grid grid-4 mb12">
        <div class="card stat"><div class="label">本班接待</div><div class="value">${num(t.guestCount)}<small> 人</small></div><div class="sub">${num(t.orderCount)} 个上钟单</div></div>
        <div class="card stat teal"><div class="label">本班总营收</div><div class="value">${money(t.totalSales)}</div><div class="sub">会员折扣让利 ${money(t.discountAmount)}</div></div>
        <div class="card stat amber"><div class="label">本班会员充值</div><div class="value">${money(t.totalRecharge)}</div><div class="sub">含赠送 ${money(t.totalGift)}</div></div>
        <div class="card stat violet"><div class="label">本班技师提成</div><div class="value">${money(t.commission)}</div><div class="sub">随单自动核算</div></div>
      </div>

      <div class="pay-cards no-print" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <div class="pay-card cash"><div class="pl">💵 现金收款</div><div class="pv">${money(t.cashSales)}</div><div class="muted" style="font-size:12px">消费 ${money(t.cashSales)} · 充值 ${money(t.cashRecharge)}</div></div>
        <div class="pay-card card"><div class="pl">💳 刷卡收款</div><div class="pv">${money(t.cardSales)}</div><div class="muted" style="font-size:12px">消费 ${money(t.cardSales)} · 充值 ${money(t.cardRecharge)}</div></div>
        <div class="pay-card member"><div class="pl">🎫 会员卡消费</div><div class="pv">${money(t.memberSales)}</div><div class="muted" style="font-size:12px">卡扣次数：${num((sh.orders || []).filter(o => o.payMethod === 'member').length)} 单</div></div>
      </div>

      <div class="section-title">技师上钟明细（${(sh.orders || []).length}）</div>
      <div class="card table-wrap mb12">
        <table class="data">
          <thead><tr><th>时间</th><th>项目</th><th>时长</th><th>技师</th><th>会员</th><th>人数</th><th>收款</th><th class="num">实收</th><th class="num">提成</th>${locked ? '' : '<th></th>'}</tr></thead>
          <tbody>
            ${(sh.orders || []).length === 0 ? `<tr><td colspan="${locked ? 9 : 10}"><div class="empty">暂无上钟记录，点击右上角「登记上钟」</div></td></tr>`
              : sh.orders.map(o => `<tr>
                <td class="nowrap">${o.time}</td>
                <td><b>${esc(o.itemName)}</b><br/><span class="muted" style="font-size:11.5px">${esc(o.itemCategory)}</span></td>
                <td>${o.duration}′</td>
                <td>${esc(o.employeeName)}<br/><span class="tag" style="font-size:10.5px">${esc(o.technicianLevelName)}</span></td>
                <td>${o.memberCardNo ? `${esc(o.memberCardNo)}<br/><span class="muted" style="font-size:11.5px">${esc(o.memberLevelName || '')}</span>` : '<span class="muted">散客</span>'}</td>
                <td>${o.guests}</td>
                <td><span class="tag ${o.payMethod === 'cash' ? 'green' : o.payMethod === 'card' ? '' : 'violet'}">${PAY_LABEL[o.payMethod]}</span>${o.discountAmount ? `<div class="muted" style="font-size:11px">让${money(o.discountAmount)}</div>` : ''}</td>
                <td class="num"><b>${money(o.amountReceived)}</b></td>
                <td class="num">${money(o.commission)}<div class="muted" style="font-size:11px">${o.commissionRate}%</div></td>
                ${locked ? '' : `<td class="right"><button class="btn btn-sm btn-danger" data-del-order="${o.id}">撤单</button></td>`}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="section-title">会员充值明细（${(sh.recharges || []).length}）</div>
      <div class="card table-wrap mb12">
        <table class="data">
          <thead><tr><th>时间</th><th>卡号</th><th>会员</th><th>等级</th><th>收款方式</th><th class="num">充值</th><th class="num">赠送</th><th>经手人</th>${locked ? '' : '<th></th>'}</tr></thead>
          <tbody>
            ${(sh.recharges || []).length === 0 ? `<tr><td colspan="${locked ? 8 : 9}"><div class="empty">暂无充值</div></td></tr>`
              : sh.recharges.map(r => `<tr>
                <td class="nowrap">${r.time}</td><td class="muted">${r.cardNo}</td><td><b>${esc(r.memberName)}</b></td>
                <td><span class="tag amber">${esc(r.levelName)}</span></td>
                <td>${PAY_LABEL[r.payMethod]}</td>
                <td class="num" style="color:#d97706"><b>+${money(r.amount)}</b></td>
                <td class="num">+${money(r.gift)}</td><td>${esc(r.operator)}</td>
                ${locked ? '' : `<td class="right"><button class="btn btn-sm btn-danger" data-del-rc="${r.id}">撤销</button></td>`}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="section-title">交接班签字确认</div>
      <div class="card">
        <div class="sign-grid">
          ${signBox('交班人（本班责任人）', sh.openerName, sh.openerSign, 'opener', locked)}
          ${signBox('接班人 / 店长复核', sh.closerName, sh.closerSign, 'closer', locked)}
        </div>
        ${locked ? `<div class="muted mt16" style="font-size:12.5px">双方已于 ${new Date(sh.closedAt).toLocaleString('zh-CN')} 完成签字确认，报表锁定。如需更正请联系总部。</div>`
          : `<div class="muted mt16" style="font-size:12.5px">交班人先签字确认款项与单据无误，接班人复核后签字即完成交接并锁定本班报表。</div>`}
      </div>`;

    if (locked) {
      $('#btn-print', wrap).addEventListener('click', () => window.print());
      return;
    }
    $('#btn-order', wrap).addEventListener('click', () => orderModal(sh, () => drawShift(id)));
    $('#btn-recharge', wrap).addEventListener('click', () => rechargeModal(sh, () => drawShift(id)));
    $('#btn-close', wrap).addEventListener('click', () => signFlow(sh, () => drawShift(id)));
    $$('[data-del-order]', wrap).forEach(b => b.addEventListener('click', () => {
      confirmBox('确认撤销该上钟单？若为会员卡支付，款项将原路退回会员卡。', async () => {
        try { await api('DELETE', '/api/shifts/orders/' + b.dataset.delOrder, {}); toast('已撤单', 'ok'); drawShift(id); }
        catch (e) { toast(e.message, 'error'); }
      }, { danger: true, yesText: '确认撤单' });
    }));
    $$('[data-del-rc]', wrap).forEach(b => b.addEventListener('click', () => {
      confirmBox('确认撤销该笔充值？会员余额将相应扣回。', async () => {
        try { await api('DELETE', '/api/shifts/recharges/' + b.dataset.delRc, {}); toast('已撤销', 'ok'); drawShift(id); }
        catch (e) { toast(e.message, 'error'); }
      }, { danger: true, yesText: '确认撤销' });
    }));

    // 补签（交班人）
    const openerPad = $('#sig-pad-opener', wrap);
    if (openerPad) {
      const pad = signaturePad(openerPad);
      $('#sig-submit-opener', wrap).addEventListener('click', async () => {
        const name = $('#sig-name-opener', wrap).value.trim();
        if (!name) return toast('请填写签字人姓名', 'error');
        if (!pad.hasInk()) return toast('请在签字区手写签名', 'error');
        try {
          await api('POST', '/api/shifts/sign', { shiftId: sh.id, role: 'opener', name, image: pad.dataURL() });
          toast('交班人已签字', 'ok'); drawShift(id);
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#sig-clear-opener', wrap).addEventListener('click', () => pad.clear());
    }
  }

  function signBox(title, defaultName, sign, role, locked) {
    if (sign) {
      return `<div class="sign-box done">
        <h4>${title}<span class="tag green">已签</span></h4>
        <img class="sig" src="${sign.image}" alt="签名">
        <div class="sig-meta">签字人：<b>${esc(sign.name)}</b> · ${new Date(sign.signedAt).toLocaleString('zh-CN')}</div>
      </div>`;
    }
    if (locked) {
      return `<div class="sign-box"><h4>${title}<span class="tag red">缺签</span></h4><div class="sig-tip">未签字</div></div>`;
    }
    if (role === 'opener') {
      return `<div class="sign-box">
        <h4>${title}</h4>
        <canvas class="sig-pad" id="sig-pad-opener"></canvas>
        <div class="field mt16" style="margin-bottom:8px"><label>签字人姓名</label><input id="sig-name-opener" value="${esc(defaultName || state.user.name)}"></div>
        <div class="flex-end"><button class="btn btn-sm" id="sig-clear-opener">清除重签</button><button class="btn btn-sm btn-primary" id="sig-submit-opener">确认签字</button></div>
      </div>`;
    }
    return `<div class="sign-box" style="opacity:.7">
      <h4>${title}</h4>
      <div class="sig-tip">请先由交班人签字</div>
      <div class="sig-meta">交班人签字后，接班人方可在此复核签名完成交接</div>
    </div>`;
  }

  function signFlow(sh, refresh) {
    if (!sh.openerSign) { toast('请先在页面下方完成交班人签字', 'error'); return; }
    const modal = openModal({
      title: '接班人复核签字',
      body: `
        <div class="mb12" style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:9px;padding:10px 14px;font-size:13px">
          本班 ${SHIFT_LABEL[sh.shift]}：接待 <b>${num(sh.totals.guestCount)}</b> 人，
          营收 <b>${money(sh.totals.totalSales)}</b>（现金 ${money(sh.totals.cashSales)} / 刷卡 ${money(sh.totals.cardSales)} / 会员卡 ${money(sh.totals.memberSales)}），
          充值 <b>${money(sh.totals.totalRecharge)}</b>。<br/>请接班人核对款项无误后手写签字。
        </div>
        <div class="field"><label>接班人姓名</label><input id="f-name" value="${esc(state.user.name)}"></div>
        <div class="field"><label>手写签名</label><canvas class="sig-pad" id="pad" style="height:140px"></canvas></div>`,
      footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-ok">确认交接，锁定报表</button>`
    });
    const pad = signaturePad($('#pad', modal));
    $('#f-ok', modal).addEventListener('click', async () => {
      const name = $('#f-name', modal).value.trim();
      if (!name) return toast('请填写接班人姓名', 'error');
      if (!pad.hasInk()) return toast('请手写签名', 'error');
      try {
        await api('POST', '/api/shifts/sign', { shiftId: sh.id, role: 'closer', name, image: pad.dataURL() });
        modal._close(); toast('交接完成，报表已锁定', 'ok'); refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function orderModal(sh, refresh) {
    const employees = (await api('GET', '/api/employees?status=active')).filter(e => e.storeId === state.user.storeId);
    const members = await api('GET', '/api/members?storeId=' + state.user.storeId);
    const activeItems = state.meta.items.filter(i => i.active);
    const modal = openModal({
      title: '登记上钟单', wide: true,
      body: `
        <div class="form-row">
          <div class="field"><label>服务项目 *</label><select id="f-item">
            ${activeItems.map(i => `<option value="${i.id}">${esc(i.name)}（${i.duration}分钟 · ${money(i.price)}）</option>`).join('')}
          </select></div>
          <div class="field"><label>上钟技师 *</label><select id="f-emp"></select></div>
          <div class="field"><label>人数</label><input id="f-guests" type="number" min="1" max="9" value="1"></div>
          <div class="field"><label>收款方式 *</label><select id="f-pay">
            <option value="cash">现金</option><option value="card">刷卡</option><option value="member">会员卡支付</option>
          </select></div>
          <div class="field full"><label>会员（散客留空；会员卡支付必选）</label>
            <select id="f-member"><option value="">— 散客 —</option>
            ${members.map(m => `<option value="${m.id}">${m.cardNo} · ${esc(m.name)} · ${esc(m.levelName)} · 余额 ${money(m.balance)}</option>`).join('')}
          </select></div>
          <div class="field full"><label>备注</label><input id="f-remark" placeholder="加钟、套餐等（选填）"></div>
        </div>
        <div id="price-preview" class="mb12" style="background:#f8fafc;border-radius:9px;padding:10px 14px;font-size:13px"></div>`,
      footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-ok">确认上钟并收款</button>`
    });

    const itemSel = $('#f-item', modal), empSel = $('#f-emp', modal), paySel = $('#f-pay', modal), memSel = $('#f-member', modal);
    function fillEmps() {
      const skilled = employees.filter(e => e.skilledItems.includes(itemSel.value));
      const pool = skilled.length ? skilled : employees;
      empSel.innerHTML = pool.map(e => `<option value="${e.id}">${esc(e.name)} · ${esc(e.levelName)}${skilled.length ? '' : '（非擅长项目）'}</option>`).join('');
    }
    function preview() {
      const item = activeItems.find(i => i.id === itemSel.value);
      const member = members.find(m => m.id === memSel.value);
      const lv = member && state.meta.memberLevels.find(l => l.id === member.levelId);
      let price = item.price, text = `挂牌价 <b>${money(item.price)}</b>`;
      if (member && paySel.value === 'member') {
        price = lv.discount >= 1 ? item.price : Math.round(item.price * lv.discount);
        text += ` · ${esc(lv.name)} ${(lv.discount * 10).toFixed(1)}折 → 卡扣 <b style="color:#7c3aed">${money(price)}</b>（卡余额 ${money(member.balance)}）`;
      } else if (member) {
        text += ` · 会员以${PAY_LABEL[paySel.value]}结算，按挂牌价收取`;
      }
      const emp = employees.find(e => e.id === empSel.value);
      if (emp) {
        const rule = state.meta.commissionRules.find(r => r.itemId === item.id && r.technicianLevelId === emp.levelId);
        text += ` · 技师提成 <b style="color:#0f766e">${money(Math.round(price * (rule?.rate || 0) / 100))}</b>（${rule?.rate || 0}%）`;
      }
      $('#price-preview', modal).innerHTML = text;
    }
    itemSel.addEventListener('change', () => { fillEmps(); preview(); });
    empSel.addEventListener('change', preview);
    paySel.addEventListener('change', preview);
    memSel.addEventListener('change', preview);
    fillEmps(); preview();

    $('#f-ok', modal).addEventListener('click', async () => {
      try {
        await api('POST', '/api/shifts/orders', {
          shiftId: sh.id, itemId: itemSel.value, employeeId: empSel.value,
          guests: Number($('#f-guests', modal).value), payMethod: paySel.value,
          memberId: memSel.value || null, remark: $('#f-remark', modal).value.trim()
        });
        modal._close(); toast('上钟单已登记，提成已核算', 'ok'); refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function rechargeModal(sh, refresh) {
    const members = await api('GET', '/api/members?storeId=' + state.user.storeId);
    const modal = openModal({
      title: '会员充值',
      body: `
        <div class="field"><label>会员 *</label><select id="f-member">
          <option value="">请选择会员</option>
          ${members.map(m => `<option value="${m.id}" data-lv="${m.levelId}">${m.cardNo} · ${esc(m.name)} · ${esc(m.levelName)} · 余额 ${money(m.balance)}</option>`).join('')}
        </select></div>
        <div class="field"><label>充值方案 *</label><select id="f-plan"></select></div>
        <div class="form-row">
          <div class="field"><label>收款方式 *</label><select id="f-pay"><option value="cash">现金</option><option value="card">刷卡</option></select></div>
          <div class="field"><label>&nbsp;</label><div id="f-preview" style="padding:9px 0;font-size:13px"></div></div>
        </div>`,
      footer: `<button class="btn" data-close>取消</button><button class="btn btn-primary" id="f-ok">确认充值</button>`
    });
    const memSel = $('#f-member', modal), planSel = $('#f-plan', modal);
    function fillPlans() {
      const m = members.find(x => x.id === memSel.value);
      if (!m) { planSel.innerHTML = ''; $('#f-preview', modal).innerHTML = ''; return; }
      const lv = state.meta.memberLevels.find(l => l.id === m.levelId);
      planSel.innerHTML = lv.plans.map(p => `<option value="${p.amount}|${p.gift}">充 ${money(p.amount)} 送 ${money(p.gift)}</option>`).join('');
      update();
    }
    function update() {
      const m = members.find(x => x.id === memSel.value);
      if (!m) return;
      const [a, g] = planSel.value.split('|').map(Number);
      $('#f-preview', modal).innerHTML = `实收 <b style="color:#d97706">${money(a)}</b>（${PAY_LABEL[$('#f-pay', modal).value]}）· 卡内到账 <b>${money(a + g)}</b> · 充值后余额 ${money(m.balance + a + g)}`;
    }
    memSel.addEventListener('change', fillPlans);
    planSel.addEventListener('change', update);
    $('#f-pay', modal).addEventListener('change', update);
    $('#f-ok', modal).addEventListener('click', async () => {
      if (!memSel.value) return toast('请选择会员', 'error');
      const [amount, gift] = planSel.value.split('|').map(Number);
      try {
        const r = await api('POST', '/api/shifts/recharges', {
          shiftId: sh.id, memberId: memSel.value, amount, gift, payMethod: $('#f-pay', modal).value
        });
        modal._close(); toast(`充值成功，卡内余额 ${money(r.balance)}`, 'ok'); refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  drawStart();
});

// =====================================================================
//                       门店端 · 历史交班报表
// =====================================================================
route('#/store/shifts', async () => {
  setTitle('交班报表');
  const wrap = el('<div><div class="muted">加载中…</div></div>');
  setContent(wrap);
  let from = daysAgo(29), to = today(), status = '';
  async function draw() {
    const qs = new URLSearchParams({ from, to });
    if (status) qs.set('status', status);
    const list = await api('GET', '/api/shifts?' + qs.toString());
    wrap.innerHTML = `
      <div class="toolbar">
        <label class="muted">日期</label>
        <input class="filter" type="date" id="f-from" value="${from}"> <span class="muted">至</span>
        <input class="filter" type="date" id="f-to" value="${to}">
        <select class="filter" id="f-status"><option value="">全部状态</option><option value="closed" ${status === 'closed' ? 'selected' : ''}>已交接</option><option value="open" ${status === 'open' ? 'selected' : ''}>进行中</option></select>
        <button class="btn btn-sm" id="f-go">查询</button>
        <span class="spacer"></span>
        <a class="btn btn-primary btn-sm" href="#/store/shift">＋ 交班工作台</a>
      </div>
      <div class="card table-wrap">
        <table class="data">
          <thead><tr><th>日期</th><th>班次</th><th>状态</th><th>交班人</th><th>接班人</th><th class="num">接待</th><th class="num">现金</th><th class="num">刷卡</th><th class="num">会员卡</th><th class="num">营收合计</th><th class="num">充值</th><th class="right">报表</th></tr></thead>
          <tbody>${list.length === 0 ? '<tr><td colspan="12"><div class="empty">该时段没有班次</div></td></tr>'
            : list.map(s => `<tr>
              <td class="nowrap">${s.date}</td>
              <td>${SHIFT_LABEL[s.shift]}</td>
              <td>${s.status === 'closed' ? '<span class="tag green">已锁定</span>' : '<span class="tag amber">进行中</span>'}</td>
              <td>${esc(s.openerName)}</td>
              <td>${esc(s.closerName || '—')}</td>
              <td class="num">${num(s.totals.guestCount)}</td>
              <td class="num">${money(s.totals.cashSales)}</td>
              <td class="num">${money(s.totals.cardSales)}</td>
              <td class="num">${money(s.totals.memberSales)}</td>
              <td class="num"><b>${money(s.totals.totalSales)}</b></td>
              <td class="num" style="color:#d97706">${money(s.totals.totalRecharge)}</td>
              <td class="right"><button class="btn btn-sm" data-view="${s.id}">查看/打印</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    $('#f-go', wrap).addEventListener('click', () => {
      from = $('#f-from', wrap).value; to = $('#f-to', wrap).value; status = $('#f-status', wrap).value; draw();
    });
    $$('[data-view]', wrap).forEach(b => b.addEventListener('click', () => shiftReportModal(b.dataset.view)));
  }
  draw();
});

async function shiftReportModal(id) {
  const sh = await api('GET', '/api/shifts/detail?id=' + id);
  const t = sh.totals;
  const modal = openModal({
    title: `交班报表 · ${sh.date} ${SHIFT_LABEL[sh.shift]}`, wide: true,
    body: `
      <div class="detail-kv mb12">
        <div><div class="k">门店</div><div class="v">${esc(storeName(sh.storeId))}</div></div>
        <div><div class="k">开班时间</div><div class="v">${new Date(sh.openedAt).toLocaleString('zh-CN')}</div></div>
        <div><div class="k">收班时间</div><div class="v">${sh.closedAt ? new Date(sh.closedAt).toLocaleString('zh-CN') : '—'}</div></div>
        <div><div class="k">状态</div><div class="v">${sh.status === 'closed' ? '已签字锁定' : '进行中'}</div></div>
      </div>
      <div class="pay-cards">
        <div class="pay-card cash"><div class="pl">💵 现金</div><div class="pv">${money(t.cashSales)}</div></div>
        <div class="pay-card card"><div class="pl">💳 刷卡</div><div class="pv">${money(t.cardSales)}</div></div>
        <div class="pay-card member"><div class="pl">🎫 会员卡</div><div class="pv">${money(t.memberSales)}</div></div>
      </div>
      <div class="detail-kv mb12">
        <div><div class="k">接待人数</div><div class="v">${num(t.guestCount)}</div></div>
        <div><div class="k">上钟单数</div><div class="v">${num(t.orderCount)}</div></div>
        <div><div class="k">营收合计</div><div class="v" style="color:#0f766e">${money(t.totalSales)}</div></div>
        <div><div class="k">会员充值</div><div class="v" style="color:#d97706">${money(t.totalRecharge)}</div></div>
      </div>
      <div class="section-title">上钟明细</div>
      <div class="table-wrap mb12"><table class="data">
        <thead><tr><th>时间</th><th>项目</th><th>技师</th><th>收款</th><th class="num">实收</th><th class="num">提成</th></tr></thead>
        <tbody>${(sh.orders || []).map(o => `<tr><td class="nowrap">${o.time}</td><td>${esc(o.itemName)}</td><td>${esc(o.employeeName)}（${esc(o.technicianLevelName)}）</td><td>${PAY_LABEL[o.payMethod]}</td><td class="num">${money(o.amountReceived)}</td><td class="num">${money(o.commission)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">无</td></tr>'}</tbody>
      </table></div>
      <div class="section-title">双方签字</div>
      <div class="sign-grid">
        ${sigView('交班人', sh.openerSign)}${sigView('接班人', sh.closerSign)}
      </div>`,
    footer: `<button class="btn" data-close>关闭</button>${sh.status === 'closed' ? '<button class="btn btn-primary" id="btn-print">🖨 打印</button>' : '<a class="btn btn-primary" href="#/store/shift">前往工作台补签</a>'}`
  });
  const bp = $('#btn-print', modal);
  if (bp) bp.addEventListener('click', () => {
    // 新开窗口打印报表正文
    const html = `<html><head><title>交班报表 ${sh.date}</title><style>
      body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:32px;color:#1e293b}
      h2{text-align:center}h3{border-left:4px solid #0f766e;padding-left:8px;margin:18px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left}
      th{background:#f1f5f9}.kv{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;font-size:13px}
      .sigs{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px}.sigs img{width:220px;height:80px;border:1px dashed #cbd5e1}
      .muted{color:#64748b;font-size:12px}
    </style></head><body>
    <h2>御足堂 · 交班结算报表</h2>
    <div class="kv">
      <div>门店：<b>${esc(storeName(sh.storeId))}</b></div><div>日期：${sh.date} ${SHIFT_LABEL[sh.shift]}</div><div>收班：${sh.closedAt ? new Date(sh.closedAt).toLocaleString('zh-CN') : ''}</div>
      <div>接待人数：<b>${num(t.guestCount)}</b></div><div>上钟单数：<b>${num(t.orderCount)}</b></div><div>会员充值：<b>${money(t.totalRecharge)}</b></div>
      <div>现金：<b>${money(t.cashSales)}</b></div><div>刷卡：<b>${money(t.cardSales)}</b></div><div>会员卡：<b>${money(t.memberSales)}</b></div>
      <div><b>营收合计：${money(t.totalSales)}</b></div><div>技师提成：<b>${money(t.commission)}</b></div><div>折扣让利：${money(t.discountAmount)}</div>
    </div>
    <h3>技师上钟明细</h3><table><thead><tr><th>时间</th><th>项目</th><th>技师</th><th>收款</th><th>实收</th><th>提成</th></tr></thead>
    <tbody>${(sh.orders || []).map(o => `<tr><td>${o.time}</td><td>${esc(o.itemName)}</td><td>${esc(o.employeeName)}（${esc(o.technicianLevelName)}）</td><td>${PAY_LABEL[o.payMethod]}</td><td>${money(o.amountReceived)}</td><td>${money(o.commission)}</td></tr>`).join('')}</tbody></table>
    <div class="sigs"><div>交班人签字：<br/>${sh.openerSign ? `<img src="${sh.openerSign.image}"><div class="muted">${esc(sh.openerSign.name)} · ${new Date(sh.openerSign.signedAt).toLocaleString('zh-CN')}</div>` : '未签'}</div>
    <div>接班人签字：<br/>${sh.closerSign ? `<img src="${sh.closerSign.image}"><div class="muted">${esc(sh.closerSign.name)} · ${new Date(sh.closerSign.signedAt).toLocaleString('zh-CN')}</div>` : '未签'}</div></div>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  });
}
function sigView(label, sign) {
  if (!sign) return `<div class="sign-box"><h4>${label}<span class="tag red">缺签</span></h4><div class="sig-tip">未签字</div></div>`;
  return `<div class="sign-box done"><h4>${label}<span class="tag green">已签</span></h4><img class="sig" src="${sign.image}"><div class="sig-meta">${esc(sign.name)} · ${new Date(sign.signedAt).toLocaleString('zh-CN')}</div></div>`;
}

// ---------------- 启动 ----------------
if (location.hash === '#/login' || (!state.token)) {
  history.replaceState(null, '', '#/login');
  renderLogin();
} else {
  boot();
}
