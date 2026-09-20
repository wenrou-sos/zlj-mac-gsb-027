'use strict';
// 业务规则与工具函数（种子数据与 API 共用）

const yuan = (n) => Math.round(n); // 金额统一取整到元

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function parseDate(s) {
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(y, m - 1, dd);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function todayStr() { return fmtDate(new Date()); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 会员价 = 挂牌价 × 等级折扣
function memberPriceOf(item, level) {
  if (!level || level.discount >= 1) return item.price;
  return yuan(item.price * level.discount);
}

// 技师提成：按"项目 × 技师等级"矩阵取比例，作用于实收金额
function commissionRateOf(rules, itemId, levelId) {
  const hit = rules.find(r => r.itemId === itemId && r.technicianLevelId === levelId);
  return hit ? hit.rate : null;
}
function commissionOf(rules, itemId, levelId, amountReceived) {
  const rate = commissionRateOf(rules, itemId, levelId);
  if (rate == null) return { rate: 0, amount: 0 };
  return { rate, amount: yuan(amountReceived * rate / 100) };
}

function shiftTotals(orders, recharges) {
  const t = {
    orderCount: orders.length,
    guestCount: orders.reduce((s, o) => s + (o.guests || 1), 0),
    cashSales: 0, cardSales: 0, memberSales: 0,
    discountAmount: 0, commission: 0,
    totalSales: 0,
    cashRecharge: 0, cardRecharge: 0,
    totalRecharge: 0, totalGift: 0
  };
  for (const o of orders) {
    if (o.payMethod === 'cash') t.cashSales += o.amountReceived;
    else if (o.payMethod === 'card') t.cardSales += o.amountReceived;
    else t.memberSales += o.amountReceived;
    t.discountAmount += o.discountAmount || 0;
    t.commission += o.commission || 0;
  }
  t.totalSales = t.cashSales + t.cardSales + t.memberSales;
  for (const r of recharges) {
    if (r.payMethod === 'cash') t.cashRecharge += r.amount;
    else t.cardRecharge += r.amount;
    t.totalRecharge += r.amount;
    t.totalGift += r.gift || 0;
  }
  return t;
}

const PAY_LABEL = { cash: '现金', card: '刷卡', member: '会员卡' };
const SHIFT_LABEL = { morning: '白班', evening: '晚班' };

module.exports = {
  yuan, pad2, fmtDate, fmtTime, parseDate, addDays, todayStr, mulberry32,
  memberPriceOf, commissionRateOf, commissionOf, shiftTotals,
  PAY_LABEL, SHIFT_LABEL
};
