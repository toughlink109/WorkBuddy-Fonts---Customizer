'use strict';
/**
 * 字体元数据读取（零依赖）
 *
 * 用途：判断某个字体家族在系统里实际装了几档字重。
 *   - 支持单字体文件（ttf / otf）与字体集合（ttc，如微软雅黑的 msyh.ttc）
 *   - 读取 name 表（nid=1 Family / nid=16 TypographicFamily）与 OS/2.usWeightClass
 *
 * 为什么要读字重：
 *   浏览器的 font-weight 只能"选"字体里真实存在的字面，不能凭空造。
 *   单字重字体（如 SimHei）请求 300 仍会渲染 400 字形，请求 700 则是合成粗体。
 *   打补丁前先查清楚，才能避免"改了没效果"。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FONT_SIZE = 200 * 1024 * 1024; // 超大字体跳过，避免读爆内存

// 常见字重名 → 数值，用于提示文案
const WEIGHT_NAMES = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 350: 'SemiLight',
  400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold',
  800: 'ExtraBold', 900: 'Black',
};

function readTableDir(buf, dirOffset) {
  if (dirOffset + 12 > buf.length) return null;
  const numTables = buf.readUInt16BE(dirOffset + 4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = dirOffset + 12 + i * 16;
    if (rec + 16 > buf.length) break;
    tables[buf.toString('latin1', rec, rec + 4)] = buf.readUInt32BE(rec + 8);
  }
  return tables;
}

// 解码一条 name 记录
function decodeName(buf, nameOff, rec) {
  const pid = buf.readUInt16BE(rec);
  const len = buf.readUInt16BE(rec + 8);
  const off = buf.readUInt16BE(rec + 10);
  const strOff = buf.readUInt16BE(nameOff + 4);
  const start = nameOff + strOff + off;
  if (start + len > buf.length) return '';
  const s = buf.slice(start, start + len);
  let t;
  if (pid === 3 || pid === 0) {
    if (s.length % 2) return '';
    const sw = Buffer.from(s);
    sw.swap16();
    t = sw.toString('utf16le');
  } else {
    t = s.toString('latin1');
  }
  return (t || '').replace(/\0/g, '').trim();
}

// 读取单个字体（一个表目录）
function readOneFace(buf, dirOffset) {
  const tables = readTableDir(buf, dirOffset);
  if (!tables) return null;
  const weight = tables['OS/2'] ? buf.readUInt16BE(tables['OS/2'] + 4) : null;
  const family = [];
  const typographicFamily = [];
  if (tables.name) {
    const nameOff = tables.name;
    if (nameOff + 6 > buf.length) return { weight, family, typographicFamily };
    const count = buf.readUInt16BE(nameOff + 2);
    for (let i = 0; i < count; i++) {
      const rec = nameOff + 6 + i * 12;
      if (rec + 12 > buf.length) break;
      const nid = buf.readUInt16BE(rec + 6);
      if (nid !== 1 && nid !== 16) continue;
      const t = decodeName(buf, nameOff, rec);
      if (!t || t.length >= 80) continue;
      (nid === 16 ? typographicFamily : family).push(t);
    }
  }
  return { weight, family, typographicFamily };
}

/**
 * 读取字体文件里的全部字面（ttc 会有多个）
 * @returns {Array<{weight:number|null, family:string[], typographicFamily:string[]}>}
 */
function readFontFaces(filePath) {
  let buf;
  try {
    if (fs.statSync(filePath).size > MAX_FONT_SIZE) return [];
    buf = fs.readFileSync(filePath);
  } catch (e) {
    return [];
  }
  if (buf.length < 12) return [];

  const tag = buf.toString('latin1', 0, 4);
  const dirOffsets = [];
  if (tag === 'ttcf') {
    // ttc：文件头后是各子字体的表目录偏移（相对文件起点）
    const numFonts = buf.readUInt32BE(8);
    for (let i = 0; i < numFonts; i++) {
      const p = 12 + i * 4;
      if (p + 4 > buf.length) break;
      const off = buf.readUInt32BE(p);
      if (off > 0 && off + 12 < buf.length) dirOffsets.push(off);
    }
  } else if (tag === 'OTTO' || tag === 'true' || tag === 'typ1' || buf.readUInt32BE(0) === 0x00010000) {
    dirOffsets.push(0);
  } else {
    return [];
  }

  const faces = [];
  for (const off of dirOffsets) {
    try {
      const face = readOneFace(buf, off);
      if (face) faces.push(face);
    } catch (e) { /* 单个子字体读失败不影响其他 */ }
  }
  return faces;
}

// 系统字体目录
function fontDirs() {
  const dirs = [];
  if (process.platform === 'win32') {
    dirs.push('C:\\Windows\\Fonts');
    if (process.env.LOCALAPPDATA) {
      dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
    }
  } else if (process.platform === 'darwin') {
    dirs.push('/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts'));
  } else {
    dirs.push('/usr/share/fonts', path.join(os.homedir(), '.local', 'share', 'fonts'));
  }
  return dirs;
}

let familyCache = null;

/**
 * 扫描系统字体，汇总每个家族装了哪些字重
 * @returns {Map<string, {weights:Set<number>, files:Set<string>, src:'nid16'|'nid1'}>}
 */
function scanInstalledFamilies() {
  if (familyCache) return familyCache;
  const map = new Map();
  const register = (name, weight, file, src) => {
    if (!name) return;
    let item = map.get(name);
    if (!item) { item = { weights: new Set(), files: new Set(), src }; map.set(name, item); }
    if (src === 'nid16') item.src = 'nid16';   // 浏览器用名优先
    if (typeof weight === 'number') item.weights.add(weight);
    item.files.add(file);
  };

  for (const dir of fontDirs()) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of files) {
      if (!/\.(ttf|otf|ttc|otc)$/i.test(f)) continue;
      const full = path.join(dir, f);
      for (const face of readFontFaces(full)) {
        // nid=16 优先（浏览器用名），没有再退回 nid=1
        if (face.typographicFamily.length) {
          for (const n of face.typographicFamily) register(n, face.weight, f, 'nid16');
        }
        for (const n of face.family) register(n, face.weight, f, 'nid1');
      }
    }
  }
  familyCache = map;
  return map;
}

/**
 * 查某个家族实际装了几档字重
 * @returns {number[] | null} 升序字重数组；家族不存在返回 null
 */
function getFamilyWeights(familyName) {
  const item = scanInstalledFamilies().get(familyName);
  if (!item) return null;
  return [...item.weights].sort((a, b) => a - b);
}

// 字重数值 → 可读名（如 300 → Light）
function weightLabel(w) {
  return WEIGHT_NAMES[w] ? `${w} ${WEIGHT_NAMES[w]}` : String(w);
}

module.exports = {
  WEIGHT_NAMES,
  readFontFaces,
  scanInstalledFamilies,
  getFamilyWeights,
  weightLabel,
  fontDirs,
};
