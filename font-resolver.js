/**
 * font-resolver.js —— 系统字体家族名解析器
 *
 * ⚠ 最重要的坑（2026-09-23 实测纠正）：
 *   一个 TTF 里往往有【两套】家族名，浏览器和 GDI 用的不是同一个：
 *     nid=1  Family            → GDI/注册表用的名（如「仓耳今楷03 W04」）
 *     nid=16 TypographicFamily → Chromium/DirectWrite 实际用的名（如「仓耳今楷03」）
 *   浏览器优先用 nid=16。填 nid=1 的名字浏览器【认不出来】，会静默回退默认字体。
 *   本脚本以 nid=16 为「推荐值」优先输出。
 *
 * 同时输出每个家族实际装了几档字重（--weight 只能选到真实存在的字面）。
 *
 * 用法：
 *   node font-resolver.js                 列出所有可用的中文/自定义字体家族名
 *   node font-resolver.js 仓耳今楷         按关键词模糊匹配，输出真实家族名与字重
 */
const { scanInstalledFamilies, weightLabel } = require('./font-meta');

// 汇总为：家族名 -> { file, src, weights }
function scanAll() {
  const all = new Map();
  for (const [name, item] of scanInstalledFamilies()) {
    const files = [...item.files];
    all.set(name, {
      file: files[0] + (files.length > 1 ? ` 等 ${files.length} 个文件` : ''),
      src: item.src,
      weights: [...item.weights].sort((a, b) => a - b),
    });
  }
  return all;
}

function weightText(weights) {
  return weights.length ? weights.map(weightLabel).join(' / ') : '未知';
}

const argv = process.argv.slice(2);
const kw = argv.filter(a => a !== '--verify').join(' ').trim();

const all = scanAll();
console.log(`扫描到 ${all.size} 个字体家族名\n`);

if (!kw) {
  // 无参数：只列出非 ASCII 家族名（通常是中文自定义字体）
  const cn = [...all.keys()].filter(n => /[\u4e00-\u9fa5]/.test(n)).sort();
  console.log(`=== 含中文的字体家族名 (${cn.length} 个) ===`);
  cn.forEach(n => {
    const v = all.get(n);
    console.log(`  ${n}${v.src === 'nid16' ? '   ★浏览器用名' : ''}   [字重 ${weightText(v.weights)}]   [${v.file}]`);
  });
  console.log('\n★ = 浏览器(Chromium)实际认的名字，优先填这个。');
} else {
  const norm = s => s.toLowerCase().replace(/[\s\-_]/g, '');
  const k = norm(kw);
  const hits = [...all.keys()].filter(n => norm(n).includes(k));
  console.log(`=== 关键词「${kw}」匹配到 ${hits.length} 个真实家族名 ===`);
  if (!hits.length) {
    console.log('  (无匹配 — 该字体可能没装，或装在注册表未登记的位置)');
  } else {
    // 浏览器用名(nid16)排前面
    hits.sort((a, b) => {
      const sa = all.get(a).src === 'nid16' ? 0 : 1;
      const sb = all.get(b).src === 'nid16' ? 0 : 1;
      return sa - sb || a.localeCompare(b);
    });
    hits.forEach(n => {
      const v = all.get(n);
      const tag = v.src === 'nid16' ? '   ★浏览器用名（推荐填这个）' : '   ⚠ GDI 注册表名（浏览器可能认不出）';
      console.log(`  ${n}${tag}`);
      console.log(`      字重: ${weightText(v.weights)}    [${v.file}]`);
    });
  }
  console.log('\n提示：优先填带「★浏览器用名」的那个。带 ⚠ 的名字 GDI 认、但浏览器可能认不出，');
  console.log('      会导致字体静默回退（看着改了其实没生效）。');
  console.log('      字重只有一档的字体，--weight light/bold 不会真的生效（浏览器不合成更细的字重）。');
}
