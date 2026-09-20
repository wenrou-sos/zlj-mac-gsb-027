'use strict';
// 演示数据生成：6 家门店 / 35 天经营流水 / 会员与技师档案
const crypto = require('crypto');
const U = require('./util');
const {
  yuan, pad2, fmtDate, fmtTime, parseDate, addDays, mulberry32,
  memberPriceOf, commissionOf
} = U;

const hash = (pw) => crypto.createHash('sha256').update('yzt:' + pw).digest('hex');

const FAMILY = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧', '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕'];
const GIVEN = ['伟', '芳', '娜', '敏', '静', '磊', '强', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '建华', '文', '华', '建国', '晓峰', '婷婷', '雪', '斌', '宇', '浩', '欣怡', '子涵', '梦琪', '雨泽', '若曦', '志强', '俊杰', '美玲', '海燕', '春燕', '国庆', '家豪', '晓燕', '志强'];

function pickName(rnd, used) {
  for (let i = 0; i < 100; i++) {
    const n = FAMILY[Math.floor(rnd() * FAMILY.length)] + GIVEN[Math.floor(rnd() * GIVEN.length)];
    if (!used.has(n)) { used.add(n); return n; }
  }
  return FAMILY[Math.floor(rnd() * FAMILY.length)] + '技师' + Math.floor(rnd() * 999);
}

function fakeSignature(name, rnd) {
  const w = 220, h = 70;
  let d = `M 12 ${38 + rnd() * 10}`;
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 20 + rnd() * 8;
    const y = 25 + rnd() * 22;
    d += ` Q ${x - 8} ${10 + rnd() * 48}, ${x} ${y}`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<rect width='100%' height='100%' fill='transparent'/>` +
    `<path d='${d}' fill='none' stroke='%230f766e' stroke-width='2.2' stroke-linecap='round'/>` +
    `<text x='${w - 70}' y='${h - 8}' font-size='12' fill='%230f766e' opacity='0.55'>${name}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function generate() {
  const rnd = mulberry32(20260919);
  const usedNames = new Set();
  let seq = 1;
  const cid = () => String(seq++).padStart(5, '0');

  const today = parseDate(fmtDate(new Date()));
  const DAY0 = today;
  const at = (day, h, m) => {
    const d = addDays(DAY0, day);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // ---------- 门店 ----------
  const storeDefs = [
    { name: '御足堂·上海静安旗舰店', city: '上海', manager: '周敏', openOffset: -420, factor: 1.25 },
    { name: '御足堂·上海陆家嘴店', city: '上海', manager: '吴海涛', openOffset: -300, factor: 1.05 },
    { name: '御足堂·杭州西湖店', city: '杭州', manager: '郑丽华', openOffset: -260, factor: 1.0 },
    { name: '御足堂·南京新街口店', city: '南京', manager: '冯建华', openOffset: -180, factor: 0.9 },
    { name: '御足堂·苏州工业园店', city: '苏州', manager: '许文斌', openOffset: -120, factor: 0.8 },
    { name: '御足堂·宁波天一广场店', city: '宁波', manager: '董雪', openOffset: -60, factor: 0.65 }
  ];
  const stores = storeDefs.map((s, i) => {
    const open = fmtDate(addDays(DAY0, s.openOffset));
    return {
      id: 'S' + String(i + 1).padStart(2, '0'),
      name: s.name, city: s.city, manager: s.manager, phone: '0' + (21 + i * 3) + '-8888' + String(1000 + i * 137),
      address: s.city + '市' + ['南京西路1266号', '世纪大道100号', '文三路88号', '中山南路18号', '星海街99号', '中山东路1号'][i],
      openedAt: open, status: 'open', factor: s.factor
    };
  });

  // ---------- 账号 ----------
  const users = [
    { id: 'u-hq', username: 'admin', name: '总部运营中心', role: 'hq', storeId: null, passwordHash: hash('123456'), active: true }
  ];
  stores.forEach((s, i) => {
    users.push({
      id: 'u-' + s.id, username: 'store' + (i + 1), name: s.manager, role: 'manager',
      storeId: s.id, passwordHash: hash('123456'), active: true
    });
  });

  // ---------- 服务项目（总部统一定价） ----------
  const itemDefs = [
    ['经典足浴', '足道', 98, 60, '泡脚+足底按摩+肩颈放松', 24],
    ['药浴养生足道', '足道', 138, 70, '十二味中药泡脚+足底反射区按摩', 13],
    ['精油足道SPA', '足道', 188, 80, '植物精油开背+足底理疗', 14],
    ['至尊皇室足道', '足道', 268, 100, '藏红花药浴+全身推拿+茶点', 6],
    ['中式全身推拿', '按摩', 168, 60, '传统手法全身经络推拿', 16],
    ['颈肩腰腿调理', '按摩', 148, 50, '针对性缓解肌肉劳损', 14],
    ['刮痧拔罐', '理疗', 68, 30, '祛湿散寒，可与项目搭配', 6],
    ['古法采耳', '特色', 88, 30, '川派采耳，舒缓减压', 7]
  ];
  const items = itemDefs.map((x, i) => ({
    id: 'P' + String(i + 1).padStart(2, '0'),
    name: x[0], category: x[1], price: x[2], duration: x[3],
    description: x[4], weight: x[5], active: true
  }));
  const weightTable = items.map(i => i.weight);
  const pickItem = () => {
    const r = rnd() * weightTable.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < items.length; i++) { acc += weightTable[i]; if (r <= acc) return items[i]; }
    return items[0];
  };

  // ---------- 技师等级 ----------
  const technicianLevels = [
    { id: 'L1', name: '初级技师', sort: 1, baseRate: 25 },
    { id: 'L2', name: '中级技师', sort: 2, baseRate: 30 },
    { id: 'L3', name: '高级技师', sort: 3, baseRate: 35 },
    { id: 'L4', name: '首席技师', sort: 4, baseRate: 42 }
  ];
  // ---------- 会员等级 ----------
  const memberLevels = [
    { id: 'V1', name: '普通会员', discount: 1.0, upgradeAt: 0, color: '#94a3b8', plans: [{ amount: 500, gift: 0 }, { amount: 1000, gift: 50 }] },
    { id: 'V2', name: '银卡会员', discount: 0.92, upgradeAt: 2000, color: '#94a3b8', plans: [{ amount: 1000, gift: 60 }, { amount: 2000, gift: 180 }] },
    { id: 'V3', name: '金卡会员', discount: 0.85, upgradeAt: 5000, color: '#d4a24c', plans: [{ amount: 2000, gift: 160 }, { amount: 3000, gift: 300 }, { amount: 5000, gift: 600 }] },
    { id: 'V4', name: '钻石会员', discount: 0.78, upgradeAt: 10000, color: '#7c3aed', plans: [{ amount: 5000, gift: 600 }, { amount: 10000, gift: 1500 }] }
  ];

  // ---------- 提成矩阵：等级基准比例 + 项目系数 ----------
  const itemAdj = { 'P05': 5, 'P06': 5, 'P07': -5, 'P08': -3 }; // 推拿类偏高、小项偏低
  const commissionRules = [];
  for (const it of items) {
    for (const lv of technicianLevels) {
      commissionRules.push({
        id: 'CR' + cid(), itemId: it.id, technicianLevelId: lv.id,
        rate: lv.baseRate + (itemAdj[it.id] || 0)
      });
    }
  }

  // ---------- 技师档案 ----------
  const employees = [];
  const trainings = [];
  const techCounts = [8, 7, 6, 5, 5, 4];
  const levelPlan = (n) => {
    const arr = new Array(n).fill('L1');
    arr[0] = 'L4';
    if (n >= 5) { arr[1] = 'L3'; arr[2] = 'L3'; }
    else arr[1] = 'L3';
    for (let i = 3; i < n; i++) arr[i] = rnd() < 0.55 ? 'L2' : 'L1';
    return arr;
  };
  const trainingLib = [
    ['新员工入职培训', '品牌文化、服务礼仪、门店SOP', ['合格', '良好']],
    ['足底反射区基础', '反射区定位与基础按摩手法', ['合格', '良好']],
    ['中式推拿进阶', '滚/按/揉/推各类手法考核', ['良好', '优秀']],
    ['药浴养生专项', '药材辨识与浴种适配话术', ['合格', '良好']],
    ['颈肩调理专项', '常见劳损评估与调理方案', ['良好', '优秀']],
    ['服务礼仪复训', '接待流程与客诉处理', ['合格']],
    ['首席技师认证', '综合技能答辩与实操考核', ['优秀']]
  ];
  stores.forEach((s, si) => {
    const plan = levelPlan(techCounts[si]);
    plan.forEach((lv, k) => {
      const name = pickName(rnd, usedNames);
      const hireDay = -Math.floor(120 + rnd() * 380);
      const skilled = new Set();
      const skillN = Math.min(items.length, 3 + Math.floor(rnd() * 4));
      const pool = items.filter(i => (lv === 'L1') ? ['P01', 'P02', 'P07', 'P08'].includes(i.id) || rnd() < 0.35 : true);
      while (skilled.size < Math.min(skillN, pool.length)) skilled.add(pool[Math.floor(rnd() * pool.length)].id);
      const emp = {
        id: 'T' + cid(), code: 'JS' + String(employees.length + 1).padStart(3, '0'),
        name, gender: rnd() < 0.45 ? '女' : '男', phone: '1' + (30 + Math.floor(rnd() * 69)) + String(Math.floor(10000000 + rnd() * 89999999)),
        storeId: s.id, levelId: lv,
        status: 'active', hireDate: fmtDate(addDays(DAY0, hireDay)), leaveDate: null,
        skilledItems: [...skilled], remark: ''
      };
      employees.push(emp);
      const tn = 1 + Math.floor(rnd() * 3);
      const chosen = new Set();
      for (let t = 0; t < tn; t++) {
        let def;
        do { def = trainingLib[Math.floor(rnd() * trainingLib.length)]; } while (chosen.has(def[0]) && chosen.size < trainingLib.length);
        chosen.add(def[0]);
        if (lv === 'L4' && t === 0) def = trainingLib[6];
        trainings.push({
          id: 'TR' + cid(), employeeId: emp.id, name: def[0], content: def[1],
          result: def[2][Math.floor(rnd() * def[2].length)],
          date: fmtDate(addDays(parseDate(emp.hireDate), 20 + Math.floor(rnd() * 120)))
        });
      }
    });
  });
  // 调动 3 人
  const transfers = [];
  const movePairs = [[0, 2], [1, 0], [3, 4]];
  movePairs.forEach(([a, b]) => {
    const cand = employees.filter(e => e.storeId === stores[a].id && e.status === 'active' && e.levelId !== 'L4');
    const e = cand[Math.floor(rnd() * cand.length)];
    const date = fmtDate(addDays(DAY0, -8 - Math.floor(rnd() * 20)));
    transfers.push({
      id: 'MV' + cid(), employeeId: e.id, employeeName: e.name,
      fromStoreId: stores[a].id, toStoreId: stores[b].id, date,
      reason: ['门店人员调配', '支援新店开业', '员工个人申请'][Math.floor(rnd() * 3)]
    });
    e.storeId = stores[b].id;
  });
  // 离职 2 人（10~16 天前）
  for (let i = 0; i < 2; i++) {
    const cand = employees.filter(e => e.status === 'active' && e.levelId === 'L1');
    const e = cand[Math.floor(rnd() * cand.length)];
    e.status = 'resigned';
    e.leaveDate = fmtDate(addDays(today, -(10 + i * 6)));
    e.remark = '个人原因离职';
  }

  // 员工在某日所属门店/是否在职
  const storeAt = (emp, dStr) => {
    let sid = emp.storeId;
    const ts = transfers.filter(t => t.employeeId === emp.id).sort((x, y) => x.date < y.date ? 1 : -1);
    for (const t of ts) if (dStr < t.date) sid = t.fromStoreId;
    return sid;
  };
  const activeAt = (emp, dStr) => {
    if (dStr < emp.hireDate) return false;
    if (emp.status === 'resigned' && dStr >= emp.leaveDate) return false;
    return true;
  };

  // ---------- 会员 ----------
  const members = [];
  const memberCounts = [14, 12, 10, 9, 8, 7];
  const levelDist = [['V1', 0.4], ['V2', 0.3], ['V3', 0.22], ['V4', 0.08]];
  const initBalance = { V1: () => Math.floor(rnd() * 3) * 100, V2: () => 300 + Math.floor(rnd() * 6) * 100, V3: () => 800 + Math.floor(rnd() * 13) * 100, V4: () => 2000 + Math.floor(rnd() * 31) * 100 };
  stores.forEach((s, si) => {
    for (let k = 0; k < memberCounts[si]; k++) {
      const r = rnd(), pickL = () => { let a = 0; for (const [id, p] of levelDist) { a += p; if (r <= a) return id; } return 'V1'; };
      const lvId = pickL();
      const openDay = -Math.floor(20 + rnd() * 260);
      members.push({
        id: 'M' + cid(), cardNo: 'VIP' + String(members.length + 1).padStart(4, '0'),
        name: pickName(rnd, usedNames), gender: rnd() < 0.52 ? '女' : '男',
        phone: '1' + (30 + Math.floor(rnd() * 69)) + String(Math.floor(10000000 + rnd() * 89999999)),
        levelId: lvId, homeStoreId: s.id, balance: initBalance[lvId](), totalRecharge: 0,
        cardOpenDate: fmtDate(addDays(DAY0, openDay)), status: 'active'
      });
    }
  });

  // ---------- 35 天流水 ----------
  const shifts = [], orders = [], recharges = [];
  // orders/recharges 不放在 db 根（随 shift 保存），但生成时先放数组
  const payRoll = () => { const r = rnd(); return r < 0.4 ? 'cash' : r < 0.66 ? 'card' : 'member'; };

  const nowHM = { h: new Date().getHours(), m: new Date().getMinutes() };

  for (let day = -34; day <= 0; day++) {
    const dStr = fmtDate(addDays(DAY0, day));
    for (const store of stores) {
      if (dStr < store.openedAt) continue;
      const storeMembers = members.filter(m => m.homeStoreId === store.id);
      const f = store.factor;

      // 班次与时间窗
      const slots = [
        { shift: 'morning', start: [10, 0], end: 16, openH: 9, openM: 55, closeH: 16, closeM: 5 },
        { shift: 'evening', start: [16, 20], end: 23, openH: 16, openM: 15, closeH: 23, closeM: 35 }
      ];
      for (const slot of slots) {
        const slotOrders = [], slotRecharges = [];
        const isToday = day === 0;
        const isCurrentEvening = isToday && slot.shift === 'evening';

        // 时间窗上限
        let maxH = slot.end;
        if (isToday) {
          if (slot.shift === 'morning') maxH = 16;
          else { if (nowHM.h < 16) maxH = -1; else maxH = nowHM.h + nowHM.m / 60 - 0.3; }
        }
        const baseCount = slot.shift === 'morning' ? 2 + Math.floor(rnd() * 7) : 3 + Math.floor(rnd() * 10);
        let count = Math.max(1, Math.round(baseCount * f));
        if (isToday && slot.shift === 'evening') count = maxH < 0 ? 0 : Math.min(count, Math.max(0, Math.floor((maxH - 16.3) * 1.4)));

        for (let z = 0; z < count; z++) {
          const item = pickItem();
          const useMember = rnd() < 0.55;
          const member = useMember ? storeMembers[Math.floor(rnd() * storeMembers.length)] : null;
          let pay = payRoll();
          let price = item.price, discount = 0, level = null;
          if (member) {
            level = memberLevels.find(l => l.id === member.levelId);
            if (pay === 'member') {
              price = memberPriceOf(item, level);
              if (member.balance < price) pay = rnd() < 0.5 ? 'cash' : 'card';
            }
            discount = item.price - price;
          } else if (pay === 'member') pay = 'cash';

          // 技师
          const techs = employees.filter(e => activeAt(e, dStr) && storeAt(e, dStr) === store.id && e.skilledItems.includes(item.id));
          const techPool = techs.length ? techs : employees.filter(e => activeAt(e, dStr) && storeAt(e, dStr) === store.id);
          const tech = techPool[Math.floor(rnd() * techPool.length)];
          const tlv = technicianLevels.find(l => l.id === tech.levelId);
          const comm = commissionOf(commissionRules, item.id, tech.levelId, price);
          if (pay === 'member') member.balance -= price;

          // 时间
          const t0h = slot.start[0] + slot.start[1] / 60;
          let th = isCurrentEvening
            ? 16.5 + rnd() * Math.max(0.01, maxH - 16.5)
            : t0h + 0.4 + rnd() * (maxH - t0h - 0.6);
          th = Math.min(th, (isCurrentEvening ? maxH : maxH) - 0.1);
          const dt = new Date(addDays(DAY0, day));
          dt.setHours(Math.floor(th), Math.floor((th % 1) * 60), 0, 0);

          slotOrders.push({
            id: 'O' + cid(),
            storeId: store.id, date: dStr, shift: slot.shift, time: fmtTime(dt), startedAt: dt.toISOString(),
            itemId: item.id, itemName: item.name, itemCategory: item.category, duration: item.duration, priceAtSale: item.price,
            employeeId: tech.id, employeeName: tech.name, technicianLevelId: tech.levelId, technicianLevelName: tlv.name,
            memberId: member ? member.id : null, memberCardNo: member ? member.cardNo : null,
            memberLevelName: member ? level.name : null,
            guests: rnd() < 0.12 ? 2 : 1,
            payMethod: pay, amountReceived: price, discountAmount: discount,
            commission: comm.amount, commissionRate: comm.rate,
            remark: ''
          });
        }
        slotOrders.sort((a, b) => a.time < b.time ? -1 : 1);

        // 充值 0~3 笔
        const rcCount = isCurrentEvening ? Math.floor(rnd() * 2) : Math.floor(rnd() * (3.2 * f + 0.6));
        for (let z = 0; z < rcCount; z++) {
          const member = storeMembers[Math.floor(rnd() * storeMembers.length)];
          const lv = memberLevels.find(l => l.id === member.levelId);
          const plan = lv.plans[Math.floor(rnd() * lv.plans.length)];
          const th = slot.start[0] + 0.5 + rnd() * (slot.end - slot.start[0] - 1);
          if (isToday && slot.shift === 'evening' && th > maxH) continue;
          const dt = new Date(addDays(DAY0, day));
          dt.setHours(Math.floor(th), Math.floor((th % 1) * 60), 0, 0);
          member.balance += plan.amount + plan.gift;
          member.totalRecharge += plan.amount;
          slotRecharges.push({
            id: 'R' + cid(), storeId: store.id, memberId: member.id, cardNo: member.cardNo,
            memberName: member.name, levelName: lv.name, amount: plan.amount, gift: plan.gift,
            payMethod: rnd() < 0.6 ? 'cash' : 'card',
            date: dStr, shift: slot.shift, time: fmtTime(dt), createdAt: dt.toISOString(),
            operator: store.manager
          });
        }

        // 收银/交接人
        const staffHere = employees.filter(e => activeAt(e, dStr) && storeAt(e, dStr) === store.id);
        const opener = staffHere[Math.floor(rnd() * staffHere.length)];
        let closer = staffHere[Math.floor(rnd() * staffHere.length)];
        if (closer.id === opener.id) closer = staffHere[(staffHere.indexOf(opener) + 1) % staffHere.length];

        let status, openerSign = null, closerSign = null, closedAt = null;
        if (isCurrentEvening) {
          status = 'open';
        } else {
          status = 'closed';
          const od = new Date(addDays(DAY0, day));
          od.setHours(slot.closeH, slot.closeM, 0, 0);
          closedAt = od.toISOString();
          openerSign = { name: opener.name, signedAt: (() => { const x = new Date(addDays(DAY0, day)); x.setHours(slot.openH, slot.openM, 0, 0); return x.toISOString(); })(), image: fakeSignature(opener.name, rnd) };
          closerSign = { name: closer.name, signedAt: closedAt, image: fakeSignature(closer.name, rnd) };
        }

        const totals = U.shiftTotals(slotOrders, slotRecharges);
        shifts.push({
          id: 'SH' + cid(), storeId: store.id, date: dStr, shift: slot.shift,
          cashierName: status === 'open' ? opener.name : closer.name,
          openerName: opener.name, closerName: status === 'open' ? '' : closer.name,
          status, openedAt: (() => { const x = new Date(addDays(DAY0, day)); x.setHours(slot.openH, slot.openM, 0, 0); return x.toISOString(); })(),
          closedAt, openerSign, closerSign,
          orders: slotOrders, recharges: slotRecharges, totals, note: ''
        });
      }
    }
  }

  return {
    meta: { createdAt: new Date().toISOString(), seq },
    stores, users, items, memberLevels, technicianLevels, commissionRules,
    members, employees, shifts, recharges: [], transfers, trainings
  };
}

module.exports = { generate };
