'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;
let saveTimer = null;

function empty() {
  return {
    meta: { createdAt: new Date().toISOString(), seq: 1 },
    stores: [],
    users: [],
    items: [],
    memberLevels: [],
    technicianLevels: [],
    commissionRules: [], // {itemId, technicianLevelId, rate, fixedAmount}
    members: [],
    employees: [],
    shifts: [],
    recharges: [],
    transfers: [],
    trainings: []
  };
}

function load() {
  if (db) return db;
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    const seed = require('./seed');
    db = seed.generate();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
  return db;
}

function get() {
  return load();
}

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  clearTimeout(saveTimer);
  const snapshot = db;
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(snapshot, null, 2), (err) => {
      if (err) console.error('保存失败:', err.message);
    });
  }, 120);
}

function nextId(prefix) {
  const d = load();
  const n = d.meta.seq++;
  save();
  return `${prefix}${String(n).padStart(5, '0')}`;
}

module.exports = { get, save, nextId, DB_FILE };
