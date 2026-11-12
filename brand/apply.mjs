#!/usr/bin/env node
/**
 * bidoda 品牌换皮重放脚本
 *
 * 设计前提：上游 OpenBidKit_Yibiao 的源码与业务逻辑零改动。
 * 所有品牌替换项集中在 brand/brand.json，本脚本只负责「重放」。
 * 上游发新版后，重新下载官方产物并再跑一次本脚本即可，无需维护 fork 或 diff。
 *
 * 用法：
 *   node brand/apply.mjs --zip releases/Yibiao-2.31.7-mac-arm64.zip
 *   node brand/apply.mjs --zip ... --level 1            # 只换应用名与图标，不碰 asar
 *   node brand/apply.mjs --zip ... --dry-run            # 只看变更清单，不落产物
 *   node brand/apply.mjs --target source --source-dir vendor/OpenBidKit_Yibiao/client
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { asarManifest } from './asar-manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BRAND = JSON.parse(fs.readFileSync(path.join(HERE, 'brand.json'), 'utf8'));
const TS = new Date().toISOString().replace(/[:.]/g, '-');

function parseArgs(argv) {
  const o = { target: 'release', level: '2', zip: null, app: null, 'source-dir': null, 'dry-run': false, help: false, 'freeze-baseline': false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o['dry-run'] = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) o[k] = true;
      else { o[k] = v; i++; }
    }
  }
  return o;
}
const OPT = parseArgs(process.argv.slice(2));

if (OPT.help) {
  console.log(`bidoda 品牌换皮重放
  --zip <path>        官方 macOS arm64 安装包 zip（省略则自动取 releases/ 下最新一个）
  --app <path>        已解压的 .app（跳过解压步骤）
  --level 1|2         1=只换应用名/图标/Info.plist；2=再加 asar 内界面文字（默认 2）
  --target release|source   release=改官方产物（默认）；source=改源码工作副本
  --source-dir <path> source 模式下的 client/ 目录
  --debrand D3,D4     source 模式下重放去标识化补丁集（默认取 brand.json debranding.enabledLevels）
  --dry-run           只打印变更清单，不写 dist/、不签名
  --freeze-baseline  建立产物基线（vendor/baselines/<baseline-id>/app.asar.sha256.json），供 verify 防杂交/防回退比对
                     macOS 产物路线：对官方原版 zip/.app 的 app.asar 建立上游基线
                     Windows 源码路线：配 --asar 直接对打包产物 app.asar 建立基线
  --asar <path>       仅用于 --freeze-baseline：直接指定产物 app.asar（Windows 路线，内存解析零落盘）
  --baseline-id <id>  仅用于 --freeze-baseline：基线目录名，默认取 versionLock.pinnedVersion（Windows 建议 <ver>-win）
升级流程：下载上游新 zip -> 重跑本脚本 -> node brand/verify.mjs 全绿 -> 切换版本指针
防杂交：先用 --freeze-baseline 建立原版基线，再 freeze 之后每次升级都比对「上游基线 + 换皮清单」，任何预期外差异即阻断`);
  process.exit(0);
}

// 自证：先用已知正例与反例跑一遍再信输出。重点验证「ASCII 技术标识符没被误改」。
if (OPT.selftest) {
  const cases = [
    { in: '易标投标工具箱', want: '投标智囊团', desc: '产品全称 → 中文对外名' },
    { in: '<title>易标投标工具箱</title>', want: '<title>投标智囊团</title>', desc: '页面标题' },
    { in: "title: '易标投标工具箱'", want: "title: '投标智囊团'", desc: '主窗口标题' },
    { in: '<span>易标</span>', want: '<span>投标智囊团</span>', desc: '侧栏品牌文字' },
    { in: 'window.yibiao?.config.load()', want: 'window.yibiao?.config.load()', desc: '内部 API 不得改动' },
    { in: "protocol.handle('yibiao-asset', cb)", want: "protocol.handle('yibiao-asset', cb)", desc: '自定义协议名不得改动' },
    { in: 'yibiao:plugins-changed', want: 'yibiao:plugins-changed', desc: '事件名不得改动' },
    { in: '易标官方API', want: '投标智囊团官方API', desc: '中文品牌字样全量替换（官方 API 功能入口由 debranding 规则整条摘除，rebrand 只做文本）' },
    { in: '易标用户交流群二维码', want: '投标智囊团用户交流群二维码', desc: '运营社群文案同样全量替换（入口由 debranding 规则摘除）' },
    { in: 'openbidkit-oss.agnet.top', want: 'openbidkit-oss.agnet.top', desc: 'ASCII 域名不参与中文替换（由 debranding 规则显式剔除）' },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = rebrand(c.in);
    const ok = got === c.want;
    if (!ok) bad++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + c.desc + (ok ? '' : ' -> 实得「' + got + '」'));
  }
  console.log(bad ? '自证 FAIL（' + bad + ' 项），不得使用本脚本' : '自证 PASS（' + cases.length + ' 项全绿）');
  process.exit(bad ? 1 : 0);
}

function fail(msg) { console.error('\n[FAIL] ' + msg + '\n'); process.exit(1); }
function log(msg) { console.log(msg); }
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}
function globToRe(g) {
  const s = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + s + '$');
}
const WHITE_RE = BRAND.asarWhiteList.map(globToRe);
function inWhiteList(rel) { return WHITE_RE.some(re => re.test(rel) || re.test('/' + rel)); }
const TEXT_EXT = new Set(BRAND.textFileExtensions);
function isText(rel) { return TEXT_EXT.has(path.extname(rel).toLowerCase()); }

/** 只替换中文品牌字样：protect 串先占位再还原，ASCII 技术标识符因此天然不会被碰到 */
function rebrand(text) {
  const KEEP = '\uE000BIDODA_KEEP_';
  const keeps = [];
  let out = text;
  for (const p of BRAND.textRules.protect) {
    if (!out.includes(p)) continue;
    const idx = keeps.push(p) - 1;
    out = out.split(p).join(KEEP + idx + '\uE001');
  }
  for (const r of BRAND.textRules.replace) out = out.split(r.old).join(r.new);
  return out.replace(/\uE000BIDODA_KEEP_(\d+)\uE001/g, (_, i) => keeps[Number(i)]);
}

function findZip() {
  if (OPT.zip) {
    const p = path.resolve(ROOT, OPT.zip);
    if (!fs.existsSync(p)) fail('指定的 zip 不存在：' + p);
    return p;
  }
  const dir = path.join(ROOT, 'releases');
  const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.zip')).sort() : [];
  if (!list.length) fail('releases/ 下没有 zip。请在浏览器下载官方 macOS arm64 安装包后放入该目录，或用 --zip 指定路径。');
  return path.join(dir, list[list.length - 1]);
}

function locateApp(dir) {
  const found = [];
  const scan = (d, depth) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name.endsWith('.app')) found.push(full);
        else scan(full, depth + 1);
      }
    }
  };
  scan(dir, 0);
  if (!found.length) fail('在解压目录中找不到 .app：' + dir);
  return found[0];
}

function pythonPlist(plistPath) {
  const code = `import plistlib,sys,json
p=sys.argv[1]
with open(p,'rb') as f: d=plistlib.load(f)
for k,v in json.loads(sys.argv[2]).items(): d[k]=v
with open(p,'wb') as f: plistlib.dump(d,f)`;
  run('python3', ['-c', code, plistPath, JSON.stringify(BRAND.infoPlist.set)]);
}

async function loadAsar() {
  try { return await import('@electron/asar'); }
  catch (e) {
    fail('缺少 @electron/asar（Level 2 必需）。请在工程根目录执行：npm install --no-save @electron/asar\n原始错误：' + e.message);
  }
}

async function main() {
  if (OPT['freeze-baseline']) return freezeBaseline();
  if (BRAND.versionLock?.required && !BRAND.versionLock.pinnedVersion) fail('brand.json versionLock.pinnedVersion 缺失：bidoda 必须锁定一个确切的上游版本，禁止无版本换皮。');
  log('bidoda 品牌换皮重放 | target=' + OPT.target + ' level=' + OPT.level + (OPT['dry-run'] ? ' [DRY-RUN]' : ''));
  log('上游：' + BRAND.upstream.repo + ' (' + BRAND.upstream.license + ')  锁定版本：' + BRAND.versionLock.pinnedVersion + '\n');

  if (OPT.target === 'source') return applySource();
  return applyRelease();
}

/**
 * 建立产物基线，供 verify 做防杂交（anti-hybrid）/防回退逐文件比对。
 *  - macOS 产物路线（默认）：对【官方原版】zip/.app 的 app.asar 建立上游基线；
 *  - Windows 源码路线（--asar）：直接对打包产物的 app.asar 建立基线（内存解析，零落盘）。
 */
async function freezeBaseline() {
  const version = BRAND.versionLock.pinnedVersion;
  const baselineId = OPT['baseline-id'] || version;
  log('建立产物基线 | upstream=' + version + ' | baselineId=' + baselineId + (OPT['dry-run'] ? ' [DRY-RUN]' : ''));
  if (BRAND.domainSyncPolicy?.reviewedAndAdopted) {
    log('当前已登记域元素：' + (BRAND.domainSyncPolicy.reviewedAndAdopted.map(x => x.term).join('、') || '（无）'));
  }

  let asarPath, manifest, fileCount, kind;
  if (OPT.asar) {
    asarPath = path.resolve(ROOT, OPT.asar);
    if (!fs.existsSync(asarPath)) fail('--asar 路径不存在：' + asarPath);
    log('读取产物 app.asar：' + path.relative(ROOT, asarPath));
    ({ manifest, fileCount } = await asarManifest(asarPath));
    kind = 'win-product-asar';
  } else {
    let appSrc;
    if (OPT.app) {
      appSrc = path.resolve(ROOT, OPT.app);
      if (!fs.existsSync(appSrc)) fail('--app 路径不存在：' + appSrc);
    } else {
      const zip = findZip();
      log('解压官方原版：' + path.basename(zip));
      const work = path.join(ROOT, 'work', 'baseline-' + TS);
      fs.mkdirSync(work, { recursive: true });
      const unpacked = path.join(work, 'unpacked');
      fs.mkdirSync(unpacked, { recursive: true });
      try { run('ditto', ['-x', '-k', zip, unpacked]); }
      catch (e) { fail('ditto 解压失败：' + e.message); }
      appSrc = locateApp(unpacked);
    }
    asarPath = path.join(appSrc, 'Contents', 'Resources', 'app.asar');
    if (!fs.existsSync(asarPath)) fail('官方原版找不到 app.asar：' + asarPath);
    const asar = await loadAsar();
    const outDir = path.join(ROOT, 'work', 'baseline-asar-' + TS);
    fs.mkdirSync(outDir, { recursive: true });
    await asar.extractAll(asarPath, outDir);
    const files = walk(outDir);
    manifest = {};
    for (const rel of files) manifest[rel] = sha256(fs.readFileSync(path.join(outDir, rel)));
    fileCount = files.length;
    kind = 'mac-upstream-asar';
  }

  if (OPT['dry-run']) { log('[DRY-RUN] 将写入基线，含 ' + fileCount + ' 个 asar 文件哈希'); return; }
  const dir = path.join(ROOT, 'vendor', 'baselines', baselineId);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'app.asar.sha256.json');
  fs.writeFileSync(out, JSON.stringify({
    version, baselineId, kind,
    sourceAsar: path.relative(ROOT, asarPath).split(path.sep).join('/'),
    generatedAt: new Date().toISOString(), fileCount, manifest
  }, null, 2), 'utf8');
  log('基线已建立：' + out + '（' + fileCount + ' 个 asar 文件哈希）');
  log('比对：node brand/verify.mjs --baseline-check <app.asar> --baseline-id ' + baselineId);
}

/** 路线 A（默认）：直接改官方预编译产物，上游源码一行不动 */
async function applyRelease() {
  const work = path.join(ROOT, 'work', 'rebrand-' + TS);
  fs.mkdirSync(work, { recursive: true });
  let appSrc;

  if (OPT.app) {
    appSrc = path.resolve(ROOT, OPT.app);
    if (!fs.existsSync(appSrc)) fail('--app 路径不存在：' + appSrc);
  } else {
    const zip = findZip();
    log('解压：' + path.basename(zip));
    const unpacked = path.join(work, 'unpacked');
    fs.mkdirSync(unpacked, { recursive: true });
    try { run('ditto', ['-x', '-k', zip, unpacked]); }
    catch (e) { fail('ditto 解压失败：' + e.message + '。可改用 unzip 或检查 zip 完整性。'); }
    appSrc = locateApp(unpacked);
  }
  log('上游应用：' + path.basename(appSrc));

  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const appDst = path.join(distDir, 'bidoda.app');
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: !!OPT['dry-run'],
    target: 'release', level: Number(OPT.level),
    sourceApp: appSrc, upstreamVersion: BRAND.upstream.pinnedVersion,
    iconReplaced: [], plistSet: {}, warnings: [], asar: null
  };

  if (!OPT['dry-run']) {
    if (fs.existsSync(appDst)) {
      const prev = appDst + '.prev-' + TS;
      fs.renameSync(appDst, prev);
      report.warnings.push('已有 dist/bidoda.app，已移动为 ' + path.basename(prev) + '（未删除，可回滚）');
    }
    run('ditto', [appSrc, appDst]);
    log('已复制为：' + appDst);
  } else {
    log('[DRY-RUN] 将复制为：' + appDst);
  }

  // ---- Level 1：应用显示名 / 图标 / Info.plist（不碰 asar） ----
  const plist = path.join(appDst, 'Contents', 'Info.plist');
  if (OPT['dry-run']) {
    log('[DRY-RUN] 将设置 Info.plist：' + JSON.stringify(BRAND.infoPlist.set) + '，保持 ' + BRAND.infoPlist.keep.join(',') + ' 不变');
  } else {
    if (!fs.existsSync(plist)) fail('找不到 Info.plist：' + plist);
    pythonPlist(plist);
    report.plistSet = BRAND.infoPlist.set;
    log('Info.plist 已设置 CFBundleName = ' + BRAND.infoPlist.set.CFBundleName + '、CFBundleDisplayName = ' + BRAND.infoPlist.set.CFBundleDisplayName + '；CFBundleIdentifier 保持不变');
  }

  const iconIcns = path.join(ROOT, BRAND.brandAssets.iconIcns);
  const resDir = path.join(appDst, 'Contents', 'Resources');
  const icnsNames = !OPT['dry-run'] && fs.existsSync(resDir)
    ? fs.readdirSync(resDir).filter(f => f.endsWith('.icns')) : [];
  if (!fs.existsSync(iconIcns)) {
    const w = '缺少 ' + BRAND.brandAssets.iconIcns + '，跳过图标替换。请先执行 brand/make-icons.sh 生成 cheersai 图标。';
    report.warnings.push(w); log('[WARN] ' + w);
  } else if (OPT['dry-run']) {
    log('[DRY-RUN] 将用 cheersai 图标覆盖 ' + (icnsNames.join(', ') || '<Resources 下所有 .icns>'));
  } else {
    for (const f of icnsNames) {
      fs.copyFileSync(iconIcns, path.join(resDir, f));
      report.iconReplaced.push(f);
    }
    log('已覆盖图标（保持原文件名，避免 CFBundleIconFile 断链）：' + icnsNames.join(', '));
  }

  // ---- Level 2：asar 内界面文字 ----
  if (String(OPT.level) !== '1') {
    const asar = await loadAsar();
    const asarPath = path.join(appDst, 'Contents', 'Resources', 'app.asar');
    const srcAsar = OPT['dry-run'] ? path.join(appSrc, 'Contents', 'Resources', 'app.asar') : asarPath;
    if (!fs.existsSync(srcAsar)) fail('找不到 app.asar：' + srcAsar);
    const outDir = path.join(work, 'asar-out');
    fs.mkdirSync(outDir, { recursive: true });
    await asar.extractAll(srcAsar, outDir);

    const files = walk(outDir);
    const before = {}, after = {}, changed = [];
    for (const rel of files) {
      const full = path.join(outDir, rel);
      const buf = fs.readFileSync(full);
      before[rel] = sha256(buf);
      if (inWhiteList(rel) && isText(rel)) {
        const text = buf.toString('utf8');
        const next = rebrand(text);
        if (next !== text) {
          if (!OPT['dry-run']) fs.writeFileSync(full, next, 'utf8');
          changed.push(rel);
        }
      }
      after[rel] = OPT['dry-run'] ? before[rel] : sha256(fs.readFileSync(full));
    }
    report.asar = {
      totalFiles: files.length, changed,
      changedOutsideWhiteList: changed.filter(r => !inWhiteList(r)),
      beforeManifest: before, afterManifest: after
    };
    log('asar 内文本文件 ' + files.length + ' 个，实际替换 ' + changed.length + ' 个：');
    for (const c of changed) log('  - ' + c);

    if (!OPT['dry-run']) {
      await asar.createPackage(outDir, asarPath);
      log('asar 已重新打包');
    }
  }

  // ---- 归属文件 + 签名 ----
  if (!OPT['dry-run']) {
    const ack = path.join(ROOT, 'brand', 'ACKNOWLEDGEMENTS.md');
    if (fs.existsSync(ack)) fs.copyFileSync(ack, path.join(resDir, 'ACKNOWLEDGEMENTS.md'));
    const vendor = path.join(ROOT, 'vendor', 'OpenBidKit_Yibiao');
    for (const f of ['LICENSE', 'NOTICE']) {
      const s = path.join(vendor, f);
      if (fs.existsSync(s)) fs.copyFileSync(s, path.join(resDir, f));
      else report.warnings.push('未找到上游 ' + f + '，请从 ' + BRAND.upstream.repo + ' 取回放入 Contents/Resources/；归属信息已在 ACKNOWLEDGEMENTS.md 中保留');
    }
    try {
      run('codesign', ['--force', '--deep', '--sign', '-', appDst]);
      log('已重新 ad-hoc 签名（改动 app 包后必须，否则 macOS 拒绝启动）');
      report.codesigned = true;
    } catch (e) { fail('codesign 失败，产物可能无法启动：' + e.message); }
    fs.writeFileSync(path.join(distDir, 'REBRAND-REPORT.json'), JSON.stringify(report, null, 2), 'utf8');
    const pin = {
      product: BRAND.product,
      upstreamVersion: BRAND.versionLock.pinnedVersion,
      pinnedAt: new Date().toISOString(),
      note: '运行实例对应上游版本自报；与 brand.json versionLock.pinnedVersion 不符即视为杂交，禁止启动。'
    };
    fs.writeFileSync(path.join(resDir, 'BIDODA-PIN.json'), JSON.stringify(pin, null, 2), 'utf8');
    report.pin = pin;
    report.domainSync = { policy: BRAND.domainSyncPolicy.default, watchedTerms: BRAND.domainSyncPolicy.watchedTerms, reviewed: BRAND.domainSyncPolicy.reviewedAndAdopted };
    log('\n完成：' + appDst);
    log('已写入 BIDODA-PIN.json（上游版本自报）+ REBRAND-REPORT.json');
    log('下一步：node brand/verify.mjs  （断言落到产物内部内容，全绿再使用）');
  } else {
    log('\n[DRY-RUN] 未写入 dist/，未签名。确认清单无误后去掉 --dry-run 重跑。');
  }
  for (const w of report.warnings) log('[WARN] ' + w);
}

/** 路线 B（可选）：改源码工作副本，供自行构建；vendor 原版保持只读 */
function applySource() {
  const src = path.resolve(ROOT, OPT['source-dir'] || path.join('vendor', 'OpenBidKit_Yibiao', 'client'));
  if (!fs.existsSync(src)) fail('源码目录不存在：' + src + '。请先取得上游源码。');
  const dryRun = !!OPT['dry-run'];
  const dst = path.join(ROOT, 'work', 'client-' + TS);
  log('源码工作副本：' + src + '\n输出：' + dst + (dryRun ? ' [DRY-RUN，不写入]' : ''));
  // 干跑时不复制整棵树，直接以上游原版为读取源、只做命中率统计，零落盘。
  if (!dryRun) fs.cpSync(src, dst, { recursive: true, filter: p => !p.includes('node_modules') && !p.includes(path.sep + 'release' + path.sep) });
  const base = dryRun ? src : dst;

  const pkgPath = path.join(base, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.build = { ...pkg.build, ...BRAND.sourceBuild.set };
  if (!dryRun) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  log('package.json build 字段' + (dryRun ? '（将）' : '已') + '覆盖：' + Object.keys(BRAND.sourceBuild.set).join(' / '));
  log('publish 置空的理由：应用内自动更新会拉官方版并把 bidoda 换皮覆盖掉。');

  const targets = ['index.html', path.join('electron', 'main.cjs'), path.join('src', 'components', 'Sidebar.tsx')];
  for (const rel of targets) {
    const p = path.join(base, rel);
    if (!fs.existsSync(p)) { log('[WARN] 跳过（文件不存在）：' + rel); continue; }
    const t = fs.readFileSync(p, 'utf8');
    const n = rebrand(t);
    if (n !== t) { if (!dryRun) fs.writeFileSync(p, n, 'utf8'); log('已替换中文品牌字样：' + rel); }
  }

  const levels = parseLevels(OPT.debrand);
  applyDebrand(base, levels, dryRun);

  if (!dryRun) fs.copyFileSync(path.join(HERE, 'ACKNOWLEDGEMENTS.md'), path.join(dst, 'ACKNOWLEDGEMENTS.md'));
  log('\n' + (dryRun ? '[DRY-RUN] 未写入 work/。' : '完成。') + '构建：cd ' + dst + ' && npm ci && npm run build && npm run dist:win');
  log('注意：npm run dist:win 打包还需 .NET 10 SDK（dotnet publish openxmlhelper）。');
}

function parseLevels(v) {
  const def = BRAND.debranding?.enabledLevels || [];
  if (v === undefined || v === true) return def;
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  return hay.split(needle).length - 1;
}

/** 单条 op 的执行：返回 { hits, text }。hits=0 即锚点未命中，交由调用方按 blockOnMiss 处置。 */
function applyOp(op, text, file, dryRun) {
  if (text === null && op.op !== 'delete-file') return { hits: 0, text };
  switch (op.op) {
    case 'replace':
    case 'set-const': {
      const hits = countOccurrences(text, op.anchor);
      return { hits, text: hits ? text.split(op.anchor).join(op.value) : text };
    }
    case 'remove-lines': {
      let hits = 0;
      const kept = text.split('\n').filter(l => { if (l.includes(op.anchor)) { hits++; return false; } return true; });
      return { hits, text: kept.join('\n') };
    }
    case 'remove-block': {
      const lines = text.split('\n');
      const a = op.anchor.trim(), b = (op.endAnchor || '').trim();
      let start = -1, end = -1;
      for (let i = 0; i < lines.length; i++) if (lines[i].trim() === a) { start = i; break; }
      if (start >= 0) for (let i = start + 1; i < lines.length; i++) if (lines[i].trim() === b) { end = i; break; }
      if (start >= 0 && end >= 0) { lines.splice(start, end - start + 1); return { hits: 1, text: lines.join('\n') }; }
      return { hits: 0, text };
    }
    case 'delete-file': {
      const exists = fs.existsSync(file);
      if (exists && !dryRun) fs.rmSync(file, { force: true });
      return { hits: exists ? 1 : 0, text: null };
    }
    default:
      fail('未知 op：' + op.op + '（规则文件 ' + file + '）');
  }
}

/** 清单驱动的 D3/D4 去标识化重放。每条规则「精确锚点 + 定点动作」，锚点未命中即暴露，绝不静默放行。 */
function applyDebrand(base, levels, dryRun) {
  const cfg = BRAND.debranding;
  if (!cfg || !Array.isArray(cfg.rules)) { log('[WARN] brand.json 无 debranding.rules，跳过去标识化重放'); return; }
  const enabled = new Set(cfg.enabledLevels || []);
  const want = new Set(levels);
  const active = cfg.rules.filter(r => enabled.has(r.level) && want.has(r.level));
  log('\n去标识化重放 | 层级 ' + levels.join(',') + ' | 规则 ' + active.length + ' 条' + (dryRun ? ' [DRY-RUN]' : ''));
  const misses = [];
  let applied = 0;
  for (const rule of active) {
    const file = path.join(base, rule.file);
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const onlyDelete = rule.ops.every(o => o.op === 'delete-file');
    if (text === null && !onlyDelete) { misses.push({ rule, reason: '文件不存在：' + rule.file }); log('  MISS  ' + rule.level + ' ' + rule.id + ' -> 文件不存在 ' + rule.file); continue; }
    let cur = text, ruleOk = true;
    const hitLog = [];
    for (const op of rule.ops) {
      const r = applyOp(op, cur, file, dryRun);
      hitLog.push(op.op + ' x' + r.hits);
      if (r.hits === 0) { ruleOk = false; misses.push({ rule, reason: '锚点未命中：' + op.op + ' 「' + String(op.anchor).split('\n')[0].slice(0, 60) + '」' }); }
      cur = r.text;
    }
    if (ruleOk && rule.verify && cur !== null) {
      for (const s of (rule.verify.mustContain || [])) if (!cur.includes(s)) { ruleOk = false; misses.push({ rule, reason: 'verify.mustContain 未满足：「' + s + '」' }); }
      for (const s of (rule.verify.mustNotContain || [])) if (cur.includes(s)) { ruleOk = false; misses.push({ rule, reason: 'verify.mustNotContain 被违反：「' + s + '」' }); }
    }
    log('  ' + (ruleOk ? 'HIT   ' : 'MISS  ') + rule.level + ' ' + rule.id + ' [' + hitLog.join(', ') + '] ' + rule.file);
    if (ruleOk) {
      applied++;
      if (!dryRun && cur !== null) fs.writeFileSync(file, cur, 'utf8');
    }
  }
  log('去标识化：命中 ' + applied + '/' + active.length + ' 条规则' + (dryRun ? '（DRY-RUN，未落盘）' : ''));
  if (misses.length) {
    for (const m of misses) log('  - ' + m.rule.level + ' ' + m.rule.id + '：' + m.reason);
    if (cfg.blockOnMiss) fail('去标识化规则未命中 ' + misses.length + ' 处，blockOnMiss=true 阻断。请修正 brand.json 锚点或上游源码已变更。');
  }
}

main().catch(e => fail('未捕获异常：' + (e && e.stack ? e.stack : String(e))));
