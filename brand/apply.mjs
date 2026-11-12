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
  --dry-run           只打印变更清单，不写 dist/、不签名
  --freeze-baseline  对【官方原版】产物建立上游版本基线（vendor/baselines/<version>/app.asar.sha256.json），供 verify 防杂交比对
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
    { in: '易标官方API', want: '易标官方API', desc: '官方在线服务标签保留（非我方品牌）' },
    { in: '易标用户交流群二维码', want: '易标用户交流群二维码', desc: '官方社群二维码说明保留' },
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

/** 对【官方原版】产物建立上游版本基线，供 verify 做防杂交（anti-hybrid）逐文件比对 */
async function freezeBaseline() {
  const version = BRAND.versionLock.pinnedVersion;
  log('建立上游版本基线 | upstream=' + version + (OPT['dry-run'] ? ' [DRY-RUN]' : ''));
  if (BRAND.domainSyncPolicy?.reviewedAndAdopted) {
    log('当前已登记域元素：' + (BRAND.domainSyncPolicy.reviewedAndAdopted.map(x => x.term).join('、') || '（无）'));
  }
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
  const asarPath = path.join(appSrc, 'Contents', 'Resources', 'app.asar');
  if (!fs.existsSync(asarPath)) fail('官方原版找不到 app.asar：' + asarPath);
  const asar = await loadAsar();
  const outDir = path.join(ROOT, 'work', 'baseline-asar-' + TS);
  fs.mkdirSync(outDir, { recursive: true });
  await asar.extractAll(asarPath, outDir);
  const files = walk(outDir);
  const manifest = {};
  for (const rel of files) manifest[rel] = sha256(fs.readFileSync(path.join(outDir, rel)));
  if (OPT['dry-run']) { log('[DRY-RUN] 将写入基线，含 ' + files.length + ' 个 asar 文件哈希'); return; }
  const dir = path.join(ROOT, 'vendor', 'baselines', version);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'app.asar.sha256.json');
  fs.writeFileSync(out, JSON.stringify({ version, generatedAt: new Date().toISOString(), fileCount: files.length, manifest }, null, 2), 'utf8');
  log('基线已建立：' + out + '（' + files.length + ' 个 asar 文件哈希）');
  log('后续 verify.mjs 将比对当前产物与该校验和；任何预期外差异即判为杂交并阻断。');
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
  const dst = path.join(ROOT, 'work', 'client-' + TS);
  log('源码工作副本：' + src + '\n输出：' + dst + (OPT['dry-run'] ? ' [DRY-RUN，不写入]' : ''));
  if (OPT['dry-run']) return;
  fs.cpSync(src, dst, { recursive: true, filter: p => !p.includes('node_modules') && !p.includes(path.sep + 'release' + path.sep) });

  const pkgPath = path.join(dst, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.build = { ...pkg.build, ...BRAND.sourceBuild.set };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  log('package.json build 字段已覆盖（productName / copyright / artifactName / publish=[]）');
  log('publish 置空的理由：应用内自动更新会拉官方版并把 bidoda 换皮覆盖掉。');

  const targets = ['index.html', path.join('electron', 'main.cjs'), path.join('src', 'components', 'Sidebar.tsx')];
  for (const rel of targets) {
    const p = path.join(dst, rel);
    if (!fs.existsSync(p)) { log('[WARN] 跳过（文件不存在）：' + rel); continue; }
    const t = fs.readFileSync(p, 'utf8');
    const n = rebrand(t);
    if (n !== t) { fs.writeFileSync(p, n, 'utf8'); log('已替换中文品牌字样：' + rel); }
  }
  fs.copyFileSync(path.join(HERE, 'ACKNOWLEDGEMENTS.md'), path.join(dst, 'ACKNOWLEDGEMENTS.md'));
  log('\n完成。构建：cd ' + dst + ' && npm ci && npm run dev');
  log('注意：npm run dist:mac 打包还需 .NET 10 SDK。');
}

main().catch(e => fail('未捕获异常：' + (e && e.stack ? e.stack : String(e))));
