#!/usr/bin/env node
/**
 * bidoda 换皮产物验收脚本
 *
 * 断言一律落到产物内部的实际内容，不停留在「文件存在」：
 *  - asar 内每个文件的 sha256 与重放报告逐项比对，证明非白名单文件字节未变；
 *  - 中文品牌字样已清除、ASCII 技术标识符仍存在，证明「改对了」且「没改坏」；
 *  - Info.plist 显示名、图标内容、代码签名逐项核验；
 *  - 【防杂交】当前产物相对「上游版本基线 + 换皮清单」不得出现预期外差异；
 *  - 【域同步】上游若引入议标等敏感域元素，未登记合规复核即阻断，绝不静默放行；
 *  - 【版本自报】运行实例必须能自报其对应的上游版本，与 brand.json 锁定值一致。
 *
 * 用法：node brand/verify.mjs [--selftest]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BRAND = JSON.parse(fs.readFileSync(path.join(HERE, 'brand.json'), 'utf8'));
const distDir = path.join(ROOT, 'dist');
const appDir = path.join(distDir, 'bidoda.app');
const reportPath = path.join(distDir, 'REBRAND-REPORT.json');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  -> ' + detail : ''));
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function globToRe(g) {
  const s = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + s + '$');
}
const WHITE_RE = BRAND.asarWhiteList.map(globToRe);
const inWhiteList = rel => WHITE_RE.some(re => re.test(rel) || re.test('/' + rel));
const TEXT_EXT = new Set(BRAND.textFileExtensions);

/** 域同步闸门（纯函数，可自证）：上游引入 watchedTerms 中的域元素，未登记即阻断 */
function domainGateResult(allText, policy) {
  const hits = [];
  for (const term of (policy.watchedTerms || [])) {
    if (!allText.includes(term)) continue;
    const reviewed = (policy.reviewedAndAdopted || []).some(r => r.term === term);
    hits.push({ term, reviewed });
  }
  const blocked = !!policy.blockedWhenUnlisted && hits.some(h => !h.reviewed);
  return { blocked, hits };
}

/** 防杂交漂移计算（纯函数，可自证）：baseline 与 current 的哈希差异，allowed 为换皮变更集 */
function computeDrift(baseline, current, allowed) {
  const allow = new Set(allowed || []);
  const drift = [];
  for (const rel of Object.keys(baseline)) {
    if (!current[rel]) { drift.push({ rel, kind: 'missing-in-current' }); continue; }
    if (current[rel] !== baseline[rel] && !allow.has(rel)) drift.push({ rel, kind: 'hash-changed' });
  }
  for (const rel of Object.keys(current)) {
    if (!(rel in baseline) && !allow.has(rel)) drift.push({ rel, kind: 'extra-in-current' });
  }
  return drift;
}

function readPlist(p) {
  const code = `import plistlib,sys,json
with open(sys.argv[1],'rb') as f: d=plistlib.load(f)
print(json.dumps({k:d.get(k) for k in ['CFBundleName','CFBundleDisplayName','CFBundleIdentifier','CFBundleIconFile']},ensure_ascii=False))`;
  return JSON.parse(execFileSync('python3', ['-c', code, p], { encoding: 'utf8' }).trim());
}

async function main() {
  console.log('bidoda 换皮产物验收\n' + '='.repeat(58));
  if (!fs.existsSync(appDir)) { check('产物 dist/bidoda.app 存在', false, '请先运行 node brand/apply.mjs'); return finish(); }
  check('产物 dist/bidoda.app 存在', true);
  if (!fs.existsSync(reportPath)) { check('重放报告存在', false, '缺少 REBRAND-REPORT.json'); return finish(); }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  check('重放报告存在', true, '上游版本 ' + report.upstreamVersion);

  // ---- 版本自报（防杂交第一关）----
  const pinPath = path.join(appDir, 'Contents', 'Resources', 'BIDODA-PIN.json');
  const locked = BRAND.versionLock?.pinnedVersion;
  if (fs.existsSync(pinPath)) {
    const pin = JSON.parse(fs.readFileSync(pinPath, 'utf8'));
    check('运行实例自报上游版本与 brand.json 锁定值一致', pin.upstreamVersion === locked,
      String(pin.upstreamVersion) + ' vs 锁定 ' + String(locked));
  } else if (BRAND.versionLock?.required) {
    check('BIDODA-PIN.json 存在（版本自报）', false, '缺少自报文件，无法证明产物对应确切上游版本');
  }

  // ---- Level 1：应用显示名、标识、图标 ----
  const plistPath = path.join(appDir, 'Contents', 'Info.plist');
  if (fs.existsSync(plistPath)) {
    const p = readPlist(plistPath);
    check('Info.plist CFBundleName = ' + BRAND.assertions.infoPlistCFBundleName, p.CFBundleName === BRAND.assertions.infoPlistCFBundleName, String(p.CFBundleName));
    check('Info.plist CFBundleDisplayName = ' + BRAND.assertions.infoPlistCFBundleDisplayName, p.CFBundleDisplayName === BRAND.assertions.infoPlistCFBundleDisplayName, String(p.CFBundleDisplayName));
    check('CFBundleIdentifier 未被改动', !!p.CFBundleIdentifier && /yibiao|openbidkit/i.test(p.CFBundleIdentifier), String(p.CFBundleIdentifier));
    check('CFBundleIconFile 引用仍有效', !p.CFBundleIconFile || fs.existsSync(path.join(appDir, 'Contents', 'Resources', p.CFBundleIconFile)), String(p.CFBundleIconFile));
  } else check('Info.plist 存在', false);

  const resDir = path.join(appDir, 'Contents', 'Resources');
  const iconLocal = path.join(ROOT, BRAND.brandAssets.iconIcns);
  if (report.iconReplaced && report.iconReplaced.length) {
    const want = sha256(fs.readFileSync(iconLocal));
    for (const f of report.iconReplaced) {
      const p = path.join(resDir, f);
      check('图标内容已替换为 cheersai：' + f, fs.existsSync(p) && sha256(fs.readFileSync(p)) === want);
    }
  } else console.log('  SKIP  图标替换（报告中无记录，见 REBRAND-REPORT.json warnings）');

  check('归属声明 ACKNOWLEDGEMENTS.md 存在', fs.existsSync(path.join(resDir, 'ACKNOWLEDGEMENTS.md')));
  check('LICENSE 随产物保留', fs.existsSync(path.join(resDir, 'LICENSE')));
  check('NOTICE 随产物保留', fs.existsSync(path.join(resDir, 'NOTICE')));

  // ---- Level 2：asar 内部内容（内存读取，零落盘）----
  // 直接复用 @electron/asar 的头部解析：一次性读入数据区到内存，按头部偏移切片，
  // 与 extractAll 的读取逻辑完全一致，但跳过 26928 次逐文件写盘（沙箱内被 broker 拖慢/杀掉）。
  let asarAllText = '';
  const currentManifest = {};
  if (report.asar) {
    let asar;
    try { asar = await import('@electron/asar'); }
    catch (e) { check('@electron/asar 可用', false, 'npm install --no-save @electron/asar'); return finish(); }
    const asarPath = path.join(resDir, 'app.asar');
    const raw = asar.getRawHeader(asarPath);          // { header, headerSize }
    const headerSize = raw.headerSize;
    const archiveSize = fs.statSync(asarPath).size;
    const dataStart = 8 + headerSize;
    const dataSize = archiveSize - dataStart;
    let dataBuf = null;
    if (dataSize > 0) {
      dataBuf = Buffer.alloc(dataSize);
      const fd = fs.openSync(asarPath, 'r');
      try { fs.readSync(fd, dataBuf, 0, dataSize, dataStart); }
      finally { fs.closeSync(fd); }
    }
    const unpackedDir = asarPath + '.unpacked';
    const readNode = (rel, node) => {
      if (node.unpacked === true) return fs.readFileSync(path.join(unpackedDir, rel));
      if (!node.size || node.size <= 0) return Buffer.alloc(0);
      const off = parseInt(node.offset, 10);
      return dataBuf.subarray(off, off + node.size);
    };
    const files = [];
    const walkHdr = (obj, prefix) => {
      for (const [name, node] of Object.entries(obj || {})) {
        if (!node || typeof node !== 'object') continue;
        const rel = prefix ? prefix + '/' + name : name;
        if ('files' in node) { walkHdr(node.files, rel); continue; }  // 目录
        if ('link' in node) continue;                                // 符号链接无独立内容
        if ('offset' in node || node.unpacked === true) files.push({ rel, node });
      }
    };
    walkHdr(raw.header.files, '');
    check('asar 文件总数与报告一致', files.length === report.asar.totalFiles, files.length + ' vs ' + report.asar.totalFiles);

    const mismatched = [];
    for (const { rel, node } of files) {
      const content = readNode(rel, node);
      const now = sha256(content);
      currentManifest[rel] = now;
      if (report.asar.afterManifest[rel] !== now) mismatched.push(rel);
      if (TEXT_EXT.has(path.extname(rel).toLowerCase())) asarAllText += '\n' + content.toString('utf8');
    }
    check('非白名单文件字节未变（逐文件 sha256 比对）', mismatched.length === 0, mismatched.length ? mismatched.slice(0, 5).join(', ') : '全部 ' + files.length + ' 个一致');

    const outside = report.asar.changed.filter(r => !inWhiteList(r));
    check('变更文件全部落在白名单内', outside.length === 0, outside.join(', ') || '白名单内 ' + report.asar.changed.length + ' 个');

    for (const s of BRAND.assertions.mustNotContain) check('界面文字已不含「' + s + '」', !asarAllText.includes(s));
    let stripped = asarAllText;
    for (const p of BRAND.textRules.protect) stripped = stripped.split(p).join('');
    for (const s of BRAND.assertions.mustNotContainStandalone) check('界面文字已清除独立「' + s + '」（保留项除外）', !stripped.includes(s));
    for (const s of BRAND.assertions.mustContain) check('技术标识符「' + s + '」未被误改', asarAllText.includes(s));

    const htmlEntries = files.filter(f => f.rel.endsWith('index.html'));
    const wantTitle = BRAND.assertions.htmlTitle;
    const titleRe = new RegExp('<title>\\s*' + wantTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*</title>');
    const titleOK = htmlEntries.some(({ rel, node }) => titleRe.test(readNode(rel, node).toString('utf8')));
    check('页面 <title> 为 ' + wantTitle, titleOK, htmlEntries.map(f => f.rel).join(', '));
  } else console.log('  SKIP  asar 内部检查（本次为 Level 1 换皮）');

  // ---- 域同步闸门（议标等关键域元素，未登记即阻断）----
  if (asarAllText && BRAND.domainSyncPolicy) {
    const dg = domainGateResult(asarAllText, BRAND.domainSyncPolicy);
    if (dg.hits.length) {
      const unreviewed = dg.hits.filter(h => !h.reviewed).map(h => h.term);
      check('域同步闸门：命中 watchedTerms 且均已登记合规复核', !dg.blocked,
        dg.blocked ? ('未登记域元素「' + unreviewed.join('、') + '」——必须先在 brand.json domainSyncPolicy.reviewedAndAdopted 登记（含版本/法律地位/适用边界/救济渠道/我方守门补充）并经复核，否则禁止升级放行')
                   : ('已登记：' + dg.hits.map(h => h.term).join('、')));
    } else {
      check('域同步闸门：未命中敏感域元素', true);
    }
  }

  // ---- 防杂交：当前产物 vs 上游版本基线 ----
  if (report.asar && Object.keys(currentManifest).length) {
    const baselinePath = path.join(ROOT, BRAND.antiHybrid?.baselinePath?.replace('${version}', locked) || '');
    if (fs.existsSync(baselinePath)) {
      const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const drift = computeDrift(base.manifest, currentManifest, new Set(report.asar.changed));
      check('防杂交：产物相对上游基线无预期外差异', drift.length === 0,
        drift.length ? drift.slice(0, 5).map(d => d.rel + '(' + d.kind + ')').join(', ') : '全部 ' + Object.keys(base.manifest).length + ' 个文件与基线一致（除换皮变更集）');
    } else {
      const w = '未找到上游基线 ' + baselinePath + '，防杂交比对降级为 WARN。请先执行 node brand/apply.mjs --freeze-baseline --zip <官方原版 zip> 建立基线。';
      console.log('  WARN  ' + w);
      if (BRAND.antiHybrid?.requireBaseline) check('防杂交：上游基线必须存在', false, w);
    }
  }

  // ---- 签名 ----
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=1', appDir], { stdio: 'pipe' });
    check('macOS 代码签名有效', true);
  } catch (e) { check('macOS 代码签名有效', false, String(e.stderr || e.message).slice(0, 200)); }

  finish();
}

function finish() {
  const bad = results.filter(r => !r.ok);
  console.log('='.repeat(58));
  console.log(bad.length ? '结论：FAIL（' + bad.length + ' 项未通过），不得投入使用' : '结论：PASS（' + results.length + ' 项全绿），可投入使用');
  if (bad.length) process.exitCode = 1;
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * 去标识化验收（源码工作副本）：消费 brand.json debranding.assert。
 * 断言落到「将来会进 asar 的源码文本」上：扫描 src/、electron/、index.html，
 * 任一残留运营域名（allowFiles 例外除外）/文案/组件标记即判 FAIL；技术标识符必须仍在。
 */
function debrandCheck(dir) {
  console.log('bidoda 去标识化验收（源码工作副本）\n' + '='.repeat(58));
  if (!fs.existsSync(dir)) { check('源码工作副本存在', false, path.relative(ROOT, dir)); return finish(); }
  check('源码工作副本存在', true, path.relative(ROOT, dir));
  const cfg = BRAND.debranding || {};
  const a = cfg.assert || {};
  const allowFiles = new Set(a.forbiddenDomainAllowFiles || []);
  const hasDist = fs.existsSync(path.join(dir, 'dist'));
  const isText = r => TEXT_EXT.has(path.extname(r).toLowerCase());
  const all = walk(dir).filter(isText);
  // 随包发布面：electron/ 原样入 asar，dist/ 为渲染层构建产物（未构建时退化为 index.html）。
  const ship = all.filter(r => /^electron\//.test(r) || (hasDist && /^dist\//.test(r)) || (!hasDist && r === 'index.html') || r === 'package.json');
  // 域名红线的守卫面更宽：源码里也不许留运营端点（即便某模块未被打包）。
  const guard = all.filter(r => /^src\//.test(r));
  const forbidden = [], texts = [], markers = [];
  const read = rel => { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return ''; } };
  for (const rel of [...new Set([...ship, ...guard])]) {
    const t = read(rel);
    const bn = path.basename(rel);
    for (const d of (a.forbiddenDomains || [])) if (t.includes(d) && !allowFiles.has(bn)) forbidden.push(rel + ' -> ' + d);
  }
  let shipText = '';
  for (const rel of ship) {
    const t = read(rel);
    shipText += '\n' + t;
    for (const s of (a.mustNotContainText || [])) if (t.includes(s)) texts.push(rel + ' -> ' + s);
    for (const s of (a.mustNotContainMarkers || [])) if (t.includes(s)) markers.push(rel + ' -> ' + s);
  }
  if (!hasDist) console.log('  WARN  未发现 dist/，按未构建近似校验（文本类断言仅覆盖 electron/）。请先 npm run build 以获得最终产物级结论。');
  check('去标识化：无残留运营域名（含 src 守卫面）', forbidden.length === 0, forbidden.slice(0, 8).join(' | ') || ('扫描 ' + ship.length + ' 随包文件 + ' + guard.length + ' 源文件；例外 ' + (a.forbiddenDomainAllowFiles || []).join(',')));
  check('去标识化：随包文本无残留运营文案', texts.length === 0, texts.slice(0, 8).join(' | ') || '干净');
  check('去标识化：随包文本无残留运营组件标记', markers.length === 0, markers.slice(0, 8).join(' | ') || '干净');
  for (const s of (a.mustContainKeep || [])) check('技术标识符保留：' + s, shipText.includes(s));

  const enabled = new Set(cfg.enabledLevels || []);
  const rules = (cfg.rules || []).filter(r => enabled.has(r.level) && r.verify);
  let ruleBad = 0;
  for (const rule of rules) {
    const p = path.join(dir, rule.file);
    if ((rule.ops || []).some(o => o.op === 'delete-file')) {
      if (fs.existsSync(p)) { ruleBad++; check(rule.level + ' ' + rule.id + ' 应已删除', false, rule.file); }
      continue;
    }
    if (!fs.existsSync(p)) { ruleBad++; check(rule.level + ' ' + rule.id + ' 目标文件存在', false, rule.file); continue; }
    const t = fs.readFileSync(p, 'utf8');
    const badNot = (rule.verify.mustNotContain || []).filter(s => t.includes(s));
    const badHas = (rule.verify.mustContain || []).filter(s => !t.includes(s));
    if (badNot.length) { ruleBad++; check(rule.level + ' ' + rule.id + ' 已清除', false, badNot.join('、')); }
    if (badHas.length) { ruleBad++; check(rule.level + ' ' + rule.id + ' 保留项', false, '缺失 ' + badHas.join('、')); }
  }
  check('全部规则 verify 断言通过', ruleBad === 0, ruleBad ? ruleBad + ' 条失败' : rules.length + ' 条规则全绿');
  finish();
}

function latestWorkClient() {
  const work = path.join(ROOT, 'work');
  if (!fs.existsSync(work)) return null;
  const list = fs.readdirSync(work).filter(n => n.startsWith('client-')).sort();
  return list.length ? path.join('work', list[list.length - 1]) : null;
}

/** 自证：用已知正例/反例跑一遍纯函数，验证闸门逻辑本身没错 */
function selftest() {
  console.log('verify.mjs 自证（域同步 / 防杂交 纯函数）\n' + '-'.repeat(50));
  const pBlock = { blockedWhenUnlisted: true, watchedTerms: ['议标'], reviewedAndAdopted: [] };
  const pOk = { blockedWhenUnlisted: true, watchedTerms: ['议标'], reviewedAndAdopted: [{ term: '议标', version: 'v9.9.9', rationale: '已复核' }] };

  const c1 = domainGateResult('本工具支持议标流程', pBlock);
  const c2 = domainGateResult('本工具支持议标流程', pOk);
  const c3 = domainGateResult('仅招标与投标', pBlock);

  const cases = [
    { ok: c1.blocked === true && c1.hits.length === 1 && c1.hits[0].reviewed === false, desc: '未登记的议标元素 → 阻断' },
    { ok: c2.blocked === false, desc: '已登记的议标元素 → 放行' },
    { ok: c3.blocked === false && c3.hits.length === 0, desc: '无敏感域元素 → 不误伤' },
  ];

  const d1 = computeDrift({ 'a.js': '1', 'b.js': '2' }, { 'a.js': '1', 'b.js': '9', 'c.js': '5' }, ['b.js']);
  const d2 = computeDrift({ 'a.js': '1', 'b.js': '2' }, { 'a.js': '1', 'b.js': '2' }, []);
  const cases2 = [
    { ok: d1.length === 1 && d1[0].rel === 'c.js' && d1[0].kind === 'extra-in-current', desc: '基线外的多余文件 → 判为漂移' },
    { ok: d1.every(x => !(x.rel === 'b.js')), desc: '换皮变更集内差异 → 不算漂移' },
    { ok: d2.length === 0, desc: '与基线完全一致 → 无漂移' },
  ];

  let bad = 0;
  for (const c of [...cases, ...cases2]) { if (!c.ok) bad++; console.log((c.ok ? '  PASS  ' : '  FAIL  ') + c.desc); }
  console.log(bad ? '自证 FAIL（' + bad + ' 项）' : '自证 PASS（' + (cases.length + cases2.length) + ' 项全绿）');
  process.exit(bad ? 1 : 0);
}

const dcIdx = process.argv.indexOf('--debrand-check');
if (process.argv.includes('--selftest')) selftest();
else if (dcIdx >= 0) {
  const next = process.argv[dcIdx + 1];
  const dir = next && !next.startsWith('--') ? path.resolve(ROOT, next) : path.resolve(ROOT, latestWorkClient() || 'work/client-missing');
  debrandCheck(dir);
} else main().catch(e => { console.error('[FAIL] 验收脚本异常：' + (e && e.stack ? e.stack : String(e))); process.exitCode = 1; });
