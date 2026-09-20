'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const dbMod = require('./db');
const U = require('./util');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const hash = (pw) => crypto.createHash('sha256').update('yzt:' + pw).digest('hex');

// ---------------- 会话 ----------------
const sessions = new Map(); // token -> userId

// ---------------- HTTP 小工具 ----------------
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function ok(res, data) { send(res, 200, { ok: true, data }); }
function fail(res, code, msg) { send(res, code, { ok: false, error: msg }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      raw += c;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  rel = rel.replace(/\.\./g, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// ---------------- 领域辅助 ----------------
const D = () => dbMod.get();
const storeById = (id) => D().stores.find(s => s.id === id) || null;
const itemById = (id) => D().items.find(i => i.id === id) || null;
const memberById = (id) => D().members.find(m => m.id === id) || null;
const employeeById = (id) => D().employees.find(e => e.id === id) || null;
const levelById = (id) => D().memberLevels.find(l => l.id === id) || null;
const techLevelById = (id) => D().technicianLevels.find(l => l.id === id) || null;

function findShift(storeId, date, shift) {
  return D().shifts.find(s => s.storeId === storeId && s.date === date && s.shift === shift) || null;
}
function recalcTotals(sh) {
  sh.totals = U.shiftTotals(sh.orders || [], sh.recharges || []);
}
function scopeStore(user, storeId) {
  if (user.role === 'hq') return storeId || null;
  return user.storeId; // 门店端强制本店
}

// ---------------- 汇总（总部看板/门店看板共用） ----------------
function aggregate(filters = {}) {
  const { storeId = null, from = null, to = null, includeOpen = false } = filters;
  const rows = D().shifts.filter((s) => {
    if (storeId && s.storeId !== storeId) return false;
    if (from && s.date < from) return false;
    if (to && s.date > to) return false;
    if (s.status !== 'closed' && !includeOpen) return false;
    return true;
  });

  let revenue = 0, cash = 0, card = 0, member = 0, recharge = 0, gift = 0, commission = 0;
  let orderCount = 0, guestCount = 0, discount = 0;
  const byStore = new Map(), byItem = new Map(), byCategory = new Map();
  const byDate = new Map();

  for (const s of rows) {
    const t = s.totals;
    revenue += t.totalSales; cash += t.cashSales; card += t.cardSales; member += t.memberSales;
    recharge += t.totalRecharge; gift += t.totalGift; commission += t.commission;
    orderCount += t.orderCount; guestCount += t.guestCount; discount += t.discountAmount;

    const bs = byStore.get(s.storeId) || { storeId: s.storeId, revenue: 0, orders: 0, recharge: 0, guestCount: 0 };
    bs.revenue += t.totalSales; bs.orders += t.orderCount; bs.recharge += t.totalRecharge; bs.guestCount += t.guestCount;
    byStore.set(s.storeId, bs);

    const bd = byDate.get(s.date) || { date: s.date, revenue: 0, recharge: 0, orders: 0 };
    bd.revenue += t.totalSales; bd.recharge += t.totalRecharge; bd.orders += t.orderCount;
    byDate.set(s.date, bd);

    for (const o of s.orders || []) {
      const bi = byItem.get(o.itemId) || { itemId: o.itemId, name: o.itemName, category: o.itemCategory, qty: 0, revenue: 0 };
      bi.qty += o.guests || 1; bi.revenue += o.amountReceived; byItem.set(o.itemId, bi);
      const bc = byCategory.get(o.itemCategory) || { category: o.itemCategory, revenue: 0 };
      bc.revenue += o.amountReceived; byCategory.set(o.itemCategory, bc);
    }
  }

  const stores = [...byStore.values()].map(x => ({
    ...x, storeName: storeById(x.storeId)?.name || x.storeId, city: storeById(x.storeId)?.city
  })).sort((a, b) => b.revenue - a.revenue);

  const items = [...byItem.values()].sort((a, b) => b.revenue - a.revenue);
  const categories = [...byCategory.values()].sort((a, b) => b.revenue - a.revenue);
  const trend = [...byDate.values()].sort((a, b) => a.date < b.date ? -1 : 1);

  return { revenue, cash, card, member, recharge, gift, commission, orderCount, guestCount, discount, stores, items, categories, trend, shiftCount: rows.length };
}

// ---------------- 路由处理 ----------------
const handlers = {};

handlers['POST /api/auth/login'] = async (req, res, body) => {
  const { username, password } = body;
  if (!username || !password) return fail(res, 400, '请输入账号和密码');
  const user = D().users.find(u => u.username === username && u.active);
  if (!user || user.passwordHash !== hash(password)) return fail(res, 401, '账号或密码错误');
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  ok(res, {
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, storeId: user.storeId }
  });
};

handlers['POST /api/auth/logout'] = async (req, res, body) => {
  sessions.delete(body.token);
  ok(res, {});
};

// 基础档案（登录即可）
handlers['GET /api/meta'] = async (req, res) => {
  ok(res, {
    stores: D().stores,
    items: D().items,
    memberLevels: D().memberLevels,
    technicianLevels: D().technicianLevels,
    commissionRules: D().commissionRules
  });
};

// 总部看板
handlers['GET /api/dashboard/hq'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '仅总部可查看');
  const d35 = aggregate({ from: U.fmtDate(U.addDays(U.parseDate(U.todayStr()), -34)) });
  const d30 = aggregate({ from: U.fmtDate(U.addDays(U.parseDate(U.todayStr()), -29)) });
  const d7 = aggregate({ from: U.fmtDate(U.addDays(U.parseDate(U.todayStr()), -6)) });
  const today = aggregate({ from: U.todayStr(), to: U.todayStr() });
  const todayLive = aggregate({ from: U.todayStr(), to: U.todayStr(), includeOpen: true });
  const members = D().members;
  const memberBalance = members.reduce((s, m) => s + m.balance, 0);
  ok(res, {
    today: {
      revenue: todayLive.revenue, cash: todayLive.cash, card: todayLive.card, member: todayLive.member,
      recharge: todayLive.recharge, orders: todayLive.orderCount, guests: todayLive.guestCount,
      openShiftCount: D().shifts.filter(s => s.date === U.todayStr() && s.status === 'open').length,
      closedShiftCount: today.shiftCount
    },
    d7, d30, d35,
    memberCount: members.filter(m => m.status === 'active').length,
    employeeCount: D().employees.filter(e => e.status === 'active').length,
    storeCount: D().stores.filter(s => s.status === 'open').length,
    memberBalance
  });
};

// 门店看板
handlers['GET /api/dashboard/store'] = async (req, res, body, user, query) => {
  const storeId = scopeStore(user, query.storeId);
  if (!storeId) return fail(res, 400, '缺少门店');
  const today = aggregate({ storeId, from: U.todayStr(), to: U.todayStr(), includeOpen: true });
  const d7 = aggregate({ storeId, from: U.fmtDate(U.addDays(U.parseDate(U.todayStr()), -6)) });
  const d30 = aggregate({ storeId, from: U.fmtDate(U.addDays(U.parseDate(U.todayStr()), -29)) });
  const openShift = D().shifts.find(s => s.storeId === storeId && s.date === U.todayStr() && s.status === 'open') || null;
  const recent = D().shifts.filter(s => s.storeId === storeId).sort((a, b) =>
    (b.date + b.shift) < (a.date + a.shift) ? -1 : 1).slice(0, 8)
    .map(s => ({ id: s.id, date: s.date, shift: s.shift, status: s.status, totals: s.totals, closerName: s.closerName }));
  const members = D().members.filter(m => m.homeStoreId === storeId);
  ok(res, {
    store: storeById(storeId),
    today, d7, d30, openShift, recent,
    memberCount: members.length,
    employeeCount: D().employees.filter(e => e.status === 'active' && e.storeId === storeId).length
  });
};

// ---- 项目定价 ----
handlers['PUT /api/items/:id'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '项目定价由总部统一管理');
  const it = itemById(req.pathParams.id);
  if (!it) return fail(res, 404, '项目不存在');
  const price = Number(body.price), duration = Number(body.duration);
  if (!(price > 0) || !(duration > 0)) return fail(res, 400, '价格与时长必须大于 0');
  it.price = U.yuan(price);
  it.duration = duration;
  it.name = String(body.name || it.name).trim();
  it.category = String(body.category || it.category).trim();
  it.description = String(body.description || '');
  it.active = !!body.active;
  dbMod.save();
  ok(res, it);
};
handlers['POST /api/items'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '项目定价由总部统一管理');
  const price = Number(body.price), duration = Number(body.duration);
  if (!body.name || !(price > 0) || !(duration > 0)) return fail(res, 400, '请完整填写项目名称/价格/时长');
  const nums = D().items.map(i => Number(i.id.slice(1)));
  const id = 'P' + String(Math.max(0, ...nums) + 1).padStart(2, '0');
  const it = {
    id, name: String(body.name).trim(), category: body.category || '足道',
    price: U.yuan(price), duration, description: body.description || '',
    weight: Number(body.weight) || 10, active: body.active !== false
  };
  D().items.push(it);
  for (const lv of D().technicianLevels) {
    D().commissionRules.push({ id: 'CR' + dbMod.nextId('x').slice(1), itemId: id, technicianLevelId: lv.id, rate: lv.baseRate });
  }
  dbMod.save();
  ok(res, it);
};

// ---- 会员等级 ----
handlers['PUT /api/member-levels/:id'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '会员体系由总部统一管理');
  const lv = levelById(req.pathParams.id);
  if (!lv) return fail(res, 404, '等级不存在');
  const discount = Number(body.discount);
  if (!(discount > 0 && discount <= 1)) return fail(res, 400, '折扣需在 0~1 之间（如 0.85）');
  lv.discount = discount;
  lv.upgradeAt = Number(body.upgradeAt) || 0;
  if (Array.isArray(body.plans)) {
    lv.plans = body.plans.map(p => ({ amount: U.yuan(Number(p.amount)), gift: U.yuan(Number(p.gift)) }))
      .filter(p => p.amount > 0);
  }
  dbMod.save();
  ok(res, lv);
};

// ---- 提成矩阵 ----
handlers['PUT /api/commission-rules'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '提成标准由总部统一管理');
  const list = body.rules;
  if (!Array.isArray(list)) return fail(res, 400, '参数错误');
  for (const r of list) {
    const rule = D().commissionRules.find(x => x.itemId === r.itemId && x.technicianLevelId === r.technicianLevelId);
    const rate = Number(r.rate);
    if (rule && rate >= 0 && rate <= 100) rule.rate = rate;
  }
  dbMod.save();
  ok(res, D().commissionRules);
};

// ---- 门店 ----
handlers['GET /api/stores'] = async (req, res, body, user) => {
  let list = D().stores;
  if (user.role !== 'hq') list = list.filter(s => s.id === user.storeId);
  const out = list.map(s => {
    const emp = D().employees.filter(e => e.status === 'active' && e.storeId === s.id).length;
    const mem = D().members.filter(m => m.homeStoreId === s.id && m.status === 'active').length;
    return { ...s, employeeCount: emp, memberCount: mem };
  });
  ok(res, out);
};
handlers['POST /api/stores'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '仅总部可开立门店');
  if (!body.name || !body.city || !body.manager) return fail(res, 400, '请填写门店名称/城市/店长');
  const nums = D().stores.map(s => Number(s.id.slice(1)));
  const id = 'S' + String(Math.max(0, ...nums) + 1).padStart(2, '0');
  const store = {
    id, name: String(body.name).trim(), city: String(body.city).trim(),
    manager: String(body.manager).trim(), phone: body.phone || '', address: body.address || '',
    openedAt: body.openedAt || U.todayStr(), status: 'open'
  };
  D().stores.push(store);
  D().users.push({
    id: 'u-' + id, username: body.username || ('store' + Number(id.slice(1))),
    name: store.manager, role: 'manager', storeId: id,
    passwordHash: hash(body.password || '123456'), active: true
  });
  dbMod.save();
  ok(res, store);
};
handlers['PUT /api/stores/:id'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '仅总部可编辑门店');
  const s = storeById(req.pathParams.id);
  if (!s) return fail(res, 404, '门店不存在');
  ['name', 'city', 'manager', 'phone', 'address', 'status'].forEach(k => {
    if (body[k] !== undefined) s[k] = String(body[k]).trim();
  });
  const u = D().users.find(x => x.storeId === s.id);
  if (u && body.manager) u.name = s.manager;
  dbMod.save();
  ok(res, s);
};

// ---- 交班报表 ----
handlers['GET /api/shifts'] = async (req, res, body, user, query) => {
  const storeId = scopeStore(user, query.storeId);
  if (!storeId) return fail(res, 400, '缺少门店');
  let list = D().shifts.filter(s => s.storeId === storeId);
  if (query.from) list = list.filter(s => s.date >= query.from);
  if (query.to) list = list.filter(s => s.date <= query.to);
  if (query.status) list = list.filter(s => s.status === query.status);
  list.sort((a, b) => (b.date < a.date || (b.date === a.date && b.shift < a.shift)) ? -1 : 1);
  ok(res, list.map(s => ({
    id: s.id, storeId: s.storeId, date: s.date, shift: s.shift, status: s.status,
    openerName: s.openerName, closerName: s.closerName, openedAt: s.openedAt, closedAt: s.closedAt,
    totals: s.totals, orderCount: (s.orders || []).length
  })));
};

handlers['GET /api/shifts/detail'] = async (req, res, body, user, query) => {
  const sh = D().shifts.find(x => x.id === query.id);
  if (!sh) return fail(res, 404, '班次不存在');
  if (user.role !== 'hq' && sh.storeId !== user.storeId) return fail(res, 403, '无权查看其他门店报表');
  ok(res, sh);
};

handlers['POST /api/shifts'] = async (req, res, body, user) => {
  const storeId = scopeStore(user, body.storeId);
  if (!storeId) return fail(res, 400, '缺少门店');
  const date = body.date || U.todayStr();
  const shift = body.shift;
  if (!['morning', 'evening'].includes(shift)) return fail(res, 400, '班次不合法');
  if (findShift(storeId, date, shift)) return fail(res, 409, '该班次报表已存在');
  const sh = {
    id: 'SH' + dbMod.nextId('x').slice(1), storeId, date, shift,
    cashierName: user.name, openerName: body.openerName || user.name, closerName: '',
    status: 'open', openedAt: new Date().toISOString(), closedAt: null,
    openerSign: null, closerSign: null, orders: [], recharges: [],
    totals: U.shiftTotals([], []), note: body.note || ''
  };
  D().shifts.push(sh);
  dbMod.save();
  ok(res, sh);
};

function ensureEditableShift(user, body) {
  const sh = D().shifts.find(x => x.id === body.shiftId);
  if (!sh) return { error: '班次不存在' };
  if (user.role !== 'hq' && sh.storeId !== user.storeId) return { error: '无权操作其他门店报表' };
  if (sh.status === 'closed') return { error: '班次已双方签字锁定，不可修改' };
  return { sh };
}

handlers['POST /api/shifts/orders'] = async (req, res, body, user) => {
  const guard = ensureEditableShift(user, body);
  if (guard.error) return fail(res, 400, guard.error);
  const sh = guard.sh;
  const item = itemById(body.itemId);
  if (!item || !item.active) return fail(res, 400, '请选择有效项目');
  const emp = employeeById(body.employeeId);
  if (!emp || emp.status !== 'active') return fail(res, 400, '请选择在岗技师');
  if (emp.storeId !== sh.storeId) return fail(res, 400, '技师不属于本门店');
  if (!['cash', 'card', 'member'].includes(body.payMethod)) return fail(res, 400, '收款方式不合法');

  let member = null, level = null;
  if (body.memberId) {
    member = memberById(body.memberId);
    if (!member || member.status !== 'active') return fail(res, 400, '会员卡无效');
    level = levelById(member.levelId);
  }
  let amount = item.price, discount = 0;
  if (member) {
    const mp = U.memberPriceOf(item, level);
    if (body.payMethod === 'member') { amount = mp; }
    discount = item.price - amount;
  }
  if (body.payMethod === 'member') {
    if (!member) return fail(res, 400, '现金/刷卡单无需关联会员');
    if (member.balance < amount) return fail(res, 400, `会员卡余额不足（余额 ¥${member.balance}）`);
  }
  const guests = Math.max(1, Math.min(9, Number(body.guests) || 1));
  const comm = U.commissionOf(D().commissionRules, item.id, emp.levelId, amount);
  const tlv = techLevelById(emp.levelId);

  if (body.payMethod === 'member') member.balance -= amount;

  const now = new Date();
  const order = {
    id: 'O' + dbMod.nextId('x').slice(1),
    storeId: sh.storeId, date: sh.date, shift: sh.shift,
    time: body.time || U.fmtTime(now), startedAt: now.toISOString(),
    itemId: item.id, itemName: item.name, itemCategory: item.category, duration: item.duration,
    priceAtSale: item.price,
    employeeId: emp.id, employeeName: emp.name, technicianLevelId: emp.levelId, technicianLevelName: tlv.name,
    memberId: member ? member.id : null, memberCardNo: member ? member.cardNo : null,
    memberLevelName: member ? level.name : null,
    guests, payMethod: body.payMethod, amountReceived: U.yuan(amount), discountAmount: discount,
    commission: comm.amount, commissionRate: comm.rate, remark: body.remark || ''
  };
  sh.orders.push(order);
  recalcTotals(sh);
  dbMod.save();
  ok(res, { order, shift: sh });
};

handlers['DELETE /api/shifts/orders/:id'] = async (req, res, body, user) => {
  const orderId = req.pathParams.id;
  const sh = D().shifts.find(s => (s.orders || []).some(o => o.id === orderId));
  if (!sh) return fail(res, 404, '上钟记录不存在');
  if (user.role !== 'hq' && sh.storeId !== user.storeId) return fail(res, 403, '无权操作');
  if (sh.status === 'closed') return fail(res, 400, '已锁定班次不可删除');
  const idx = sh.orders.findIndex(o => o.id === orderId);
  const order = sh.orders[idx];
  if (order.payMethod === 'member' && order.memberId) {
    const m = memberById(order.memberId);
    if (m) m.balance += order.amountReceived; // 原路退回会员卡
  }
  sh.orders.splice(idx, 1);
  recalcTotals(sh);
  dbMod.save();
  ok(res, { shift: sh });
};

handlers['POST /api/shifts/recharges'] = async (req, res, body, user) => {
  const guard = ensureEditableShift(user, body);
  if (guard.error) return fail(res, 400, guard.error);
  const sh = guard.sh;
  const member = memberById(body.memberId);
  if (!member || member.status !== 'active') return fail(res, 400, '会员不存在');
  if (member.homeStoreId !== sh.storeId && user.role !== 'hq') return fail(res, 400, '该会员非本店注册');
  const amount = U.yuan(Number(body.amount));
  const gift = U.yuan(Number(body.gift) || 0);
  if (!(amount > 0)) return fail(res, 400, '充值金额必须大于 0');
  if (!['cash', 'card'].includes(body.payMethod)) return fail(res, 400, '充值仅支持现金/刷卡');
  const lv = levelById(member.levelId);
  const now = new Date();
  const rec = {
    id: 'R' + dbMod.nextId('x').slice(1), storeId: sh.storeId, memberId: member.id,
    cardNo: member.cardNo, memberName: member.name, levelName: lv.name,
    amount, gift, payMethod: body.payMethod,
    date: sh.date, shift: sh.shift, time: body.time || U.fmtTime(now), createdAt: now.toISOString(),
    operator: user.name
  };
  member.balance += amount + gift;
  member.totalRecharge += amount;
  sh.recharges.push(rec);
  recalcTotals(sh);
  dbMod.save();
  ok(res, { recharge: rec, shift: sh, balance: member.balance });
};

handlers['DELETE /api/shifts/recharges/:id'] = async (req, res, body, user) => {
  const id = req.pathParams.id;
  const sh = D().shifts.find(s => (s.recharges || []).some(r => r.id === id));
  if (!sh) return fail(res, 404, '充值记录不存在');
  if (user.role !== 'hq' && sh.storeId !== user.storeId) return fail(res, 403, '无权操作');
  if (sh.status === 'closed') return fail(res, 400, '已锁定班次不可删除');
  const idx = sh.recharges.findIndex(r => r.id === id);
  const rec = sh.recharges[idx];
  const m = memberById(rec.memberId);
  if (m) m.balance = Math.max(0, m.balance - rec.amount - rec.gift);
  sh.recharges.splice(idx, 1);
  recalcTotals(sh);
  dbMod.save();
  ok(res, { shift: sh });
};

handlers['POST /api/shifts/sign'] = async (req, res, body, user) => {
  const sh = D().shifts.find(x => x.id === body.shiftId);
  if (!sh) return fail(res, 404, '班次不存在');
  if (user.role !== 'hq' && sh.storeId !== user.storeId) return fail(res, 403, '无权操作');
  if (sh.status === 'closed') return fail(res, 400, '班次已锁定');
  const signName = String(body.name || '').trim();
  const image = String(body.image || '');
  if (!signName) return fail(res, 400, '请填写签字人姓名');
  if (!image.startsWith('data:image/')) return fail(res, 400, '请在签字区手写签名');
  const sig = { name: signName, signedAt: new Date().toISOString(), image };

  if (body.role === 'opener') {
    sh.openerSign = sig;
    if (!sh.openerName) sh.openerName = signName;
  } else if (body.role === 'closer') {
    if (!sh.openerSign) return fail(res, 400, '请先由交班人签字，再由接班人确认');
    sh.closerSign = sig;
    sh.closerName = signName;
    sh.cashierName = signName;
    sh.status = 'closed';
    sh.closedAt = new Date().toISOString();
    recalcTotals(sh);
  } else return fail(res, 400, '签字角色不合法');
  dbMod.save();
  ok(res, sh);
};

handlers['DELETE /api/shifts/:id'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '仅总部可删除报表');
  const idx = D().shifts.findIndex(s => s.id === req.pathParams.id);
  if (idx < 0) return fail(res, 404, '班次不存在');
  D().shifts.splice(idx, 1);
  dbMod.save();
  ok(res, {});
};

// ---- 员工（技师） ----
handlers['GET /api/employees'] = async (req, res, body, user, query) => {
  let list = D().employees.slice();
  const storeId = scopeStore(user, query.storeId);
  if (storeId) list = list.filter(e => e.storeId === storeId);
  if (query.status) list = list.filter(e => e.status === query.status);
  list.sort((a, b) => a.code < b.code ? -1 : 1);
  const trainMap = new Map();
  D().trainings.forEach(t => { (trainMap.get(t.employeeId) || trainMap.set(t.employeeId, []).get(t.employeeId)).push(t); });
  ok(res, list.map(e => ({
    ...e,
    storeName: storeById(e.storeId)?.name || '—',
    levelName: techLevelById(e.levelId)?.name || '',
    skilledNames: e.skilledItems.map(id => itemById(id)?.name).filter(Boolean),
    trainings: (trainMap.get(e.id) || []).sort((a, b) => a.date < b.date ? 1 : -1),
    transferHistory: D().transfers.filter(t => t.employeeId === e.id).sort((a, b) => a.date < b.date ? 1 : -1)
  })));
};

handlers['POST /api/employees'] = async (req, res, body, user) => {
  const storeId = scopeStore(user, body.storeId);
  if (!storeId || !storeById(storeId)) return fail(res, 400, '请选择所属门店');
  if (!body.name || !body.levelId) return fail(res, 400, '请填写姓名与技师等级');
  if (!techLevelById(body.levelId)) return fail(res, 400, '技师等级不合法');
  const codes = D().employees.map(e => Number(e.code.replace(/\D/g, '')));
  const code = 'JS' + String(Math.max(0, ...codes) + 1).padStart(3, '0');
  const emp = {
    id: 'T' + dbMod.nextId('x').slice(1), code,
    name: String(body.name).trim(), gender: body.gender === '女' ? '女' : '男',
    phone: body.phone || '', storeId, levelId: body.levelId,
    status: 'active', hireDate: body.hireDate || U.todayStr(), leaveDate: null,
    skilledItems: Array.isArray(body.skilledItems) ? body.skilledItems : [], remark: body.remark || ''
  };
  D().employees.push(emp);
  (Array.isArray(body.trainings) ? body.trainings : []).forEach(t => {
    if (!t.name) return;
    D().trainings.push({
      id: 'TR' + dbMod.nextId('x').slice(1), employeeId: emp.id,
      name: String(t.name).trim(), content: t.content || '', result: t.result || '合格',
      date: t.date || U.todayStr()
    });
  });
  dbMod.save();
  ok(res, emp);
};

handlers['PUT /api/employees/:id'] = async (req, res, body, user) => {
  const emp = employeeById(req.pathParams.id);
  if (!emp) return fail(res, 404, '技师不存在');
  if (user.role !== 'hq' && emp.storeId !== user.storeId) return fail(res, 403, '无权操作其他门店员工');
  ['name', 'gender', 'phone', 'remark'].forEach(k => { if (body[k] !== undefined) emp[k] = String(body[k]); });
  if (body.levelId && techLevelById(body.levelId)) emp.levelId = body.levelId;
  if (Array.isArray(body.skilledItems)) emp.skilledItems = body.skilledItems;
  dbMod.save();
  ok(res, emp);
};

handlers['POST /api/employees/:id/trainings'] = async (req, res, body, user) => {
  const emp = employeeById(req.pathParams.id);
  if (!emp) return fail(res, 404, '技师不存在');
  if (user.role !== 'hq' && emp.storeId !== user.storeId) return fail(res, 403, '无权操作');
  if (!body.name || !body.date) return fail(res, 400, '请填写培训名称与日期');
  const tr = {
    id: 'TR' + dbMod.nextId('x').slice(1), employeeId: emp.id,
    name: String(body.name).trim(), content: body.content || '',
    result: body.result || '合格', date: body.date
  };
  D().trainings.push(tr);
  dbMod.save();
  ok(res, tr);
};

handlers['POST /api/employees/:id/transfer'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '跨店调动由总部审批执行');
  const emp = employeeById(req.pathParams.id);
  if (!emp) return fail(res, 404, '技师不存在');
  if (emp.status !== 'active') return fail(res, 400, '离职技师不可调动');
  const to = storeById(body.toStoreId);
  if (!to) return fail(res, 400, '请选择调入门店');
  if (to.id === emp.storeId) return fail(res, 400, '调入门店与现门店相同');
  const date = body.date || U.todayStr();
  const rec = {
    id: 'MV' + dbMod.nextId('x').slice(1), employeeId: emp.id, employeeName: emp.name,
    fromStoreId: emp.storeId, toStoreId: to.id, date,
    reason: body.reason || '门店人员调配'
  };
  D().transfers.push(rec);
  emp.storeId = to.id;
  dbMod.save();
  ok(res, rec);
};

handlers['POST /api/employees/:id/resign'] = async (req, res, body, user) => {
  const emp = employeeById(req.pathParams.id);
  if (!emp) return fail(res, 404, '技师不存在');
  if (user.role !== 'hq' && emp.storeId !== user.storeId) return fail(res, 403, '无权操作');
  if (emp.status !== 'active') return fail(res, 400, '技师已离职');
  emp.status = 'resigned';
  emp.leaveDate = body.date || U.todayStr();
  emp.remark = body.reason || '个人原因';
  dbMod.save();
  ok(res, emp);
};

handlers['GET /api/transfers'] = async (req, res, body, user, query) => {
  let list = D().transfers.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  if (user.role !== 'hq') list = list.filter(t => t.fromStoreId === user.storeId || t.toStoreId === user.storeId);
  ok(res, list.map(t => ({
    ...t,
    fromStoreName: storeById(t.fromStoreId)?.name || t.fromStoreId,
    toStoreName: storeById(t.toStoreId)?.name || t.toStoreId
  })));
};

// ---- 会员 ----
handlers['GET /api/members'] = async (req, res, body, user, query) => {
  let list = D().members.slice();
  const storeId = scopeStore(user, query.storeId);
  if (storeId) list = list.filter(m => m.homeStoreId === storeId);
  if (query.levelId) list = list.filter(m => m.levelId === query.levelId);
  if (query.q) {
    const q = String(query.q).trim();
    list = list.filter(m => m.name.includes(q) || m.cardNo.includes(q) || m.phone.includes(q));
  }
  list.sort((a, b) => a.cardNo < b.cardNo ? -1 : 1);
  ok(res, list.map(m => ({
    ...m,
    levelName: levelById(m.levelId)?.name || '',
    homeStoreName: storeById(m.homeStoreId)?.name || '—'
  })));
};

handlers['POST /api/members'] = async (req, res, body, user) => {
  const storeId = scopeStore(user, body.homeStoreId);
  if (!storeId) return fail(res, 400, '请选择办卡门店');
  if (!body.name || !body.phone) return fail(res, 400, '请填写姓名与手机号');
  if (D().members.some(m => m.phone === body.phone)) return fail(res, 409, '该手机号已办理会员卡');
  const nums = D().members.map(m => Number(m.cardNo.replace(/\D/g, '')));
  const m = {
    id: 'M' + dbMod.nextId('x').slice(1),
    cardNo: 'VIP' + String(Math.max(0, ...nums) + 1).padStart(4, '0'),
    name: String(body.name).trim(), gender: body.gender === '男' ? '男' : '女',
    phone: String(body.phone).trim(), levelId: body.levelId || 'V1',
    homeStoreId: storeId, balance: 0, totalRecharge: 0,
    cardOpenDate: U.todayStr(), status: 'active'
  };
  D().members.push(m);
  dbMod.save();
  ok(res, m);
};

handlers['PUT /api/members/:id/level'] = async (req, res, body, user) => {
  if (user.role !== 'hq') return fail(res, 403, '会员等级调整由总部管理');
  const m = memberById(req.pathParams.id);
  if (!m) return fail(res, 404, '会员不存在');
  if (!levelById(body.levelId)) return fail(res, 400, '等级不合法');
  m.levelId = body.levelId;
  dbMod.save();
  ok(res, m);
};

// 会员充值/消费明细
handlers['GET /api/members/:id/ledger'] = async (req, res, body, user, query, reqCtx) => {
  const m = memberById(reqCtx.pathParams.id);
  if (!m) return fail(res, 404, '会员不存在');
  const recharges = [], consumes = [];
  for (const s of D().shifts) {
    for (const r of s.recharges || []) if (r.memberId === m.id) recharges.push({ ...r, storeName: storeById(s.storeId)?.name });
    for (const o of s.orders || []) if (o.memberId === m.id && o.payMethod === 'member')
      consumes.push({ id: o.id, date: o.date, time: o.time, amount: o.amountReceived, itemName: o.itemName, storeName: storeById(s.storeId)?.name });
  }
  recharges.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
  consumes.sort((a, b) => (b.date + b.time) < (a.date + a.time) ? 1 : -1);
  ok(res, { member: { ...m, levelName: levelById(m.levelId)?.name }, recharges, consumes });
};

// ---------------- 服务器 ----------------
async function handler(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  // 鉴权
  const token = req.headers['x-token'] || parsed.query.token;
  const userId = sessions.get(token);
  const user = userId ? D().users.find(u => u.id === userId) : null;
  const openApi = pathname === '/api/auth/login';
  if (!openApi && !user) return fail(res, 401, '未登录或会话已过期');

  let body = {};
  if (req.method !== 'GET') {
    try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
  }

  // 路由匹配（含 :param）
  const route = req.method + ' ' + pathname;
  const fn = handlers[route];
  const reqCtx = { pathParams: {} };
  req.pathParams = {};
  if (fn) return fn(req, res, body, user, parsed.query, reqCtx);

  for (const key of Object.keys(handlers)) {
    const [m, p] = key.split(' ');
    if (m !== req.method) continue;
    const ps = p.split('/'), as = pathname.split('/');
    if (ps.length !== as.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(as[i]);
      else if (ps[i] !== as[i]) { matched = false; break; }
    }
    if (matched) {
      reqCtx.pathParams = params;
      req.pathParams = params;
      return handlers[key](req, res, body, user, parsed.query, reqCtx);
    }
  }
  fail(res, 404, '接口不存在: ' + route);
}

const server = http.createServer((req, res) => {
  handler(req, res).catch(err => {
    console.error(err);
    fail(res, 500, '服务器内部错误: ' + err.message);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  御足堂 · 连锁足浴总部分店管理平台');
  console.log('  ────────────────────────────────────');
  console.log(`  访问地址 : http://localhost:${PORT}`);
  console.log('  总部账号 : admin / 123456');
  console.log('  门店账号 : store1 ~ store6 / 123456');
  console.log('');
});
