#!/usr/bin/env node
/**
 * bidoda 上游客户化 · 全量验收流水线（本工程的唯一权威验收命令集）
 *
 * 用法：
 *   node .trae/skills/bidoda-upstream-customization/scripts/acceptance.mjs --work work/win-build-2.32.2
 *   ... --work <工作副本> --asar <产物>/win-unpacked/resources/app.asar --baseline-id v2.32.2-win
 *   ... --work <工作副本> --asar <app.asar> --baseline-id <id> --freeze   # 先建基线再比对
 *
 * 退出码：0 = 全绿可出包；1 = 有闸门未通过，禁止出包。
 *
 * 闸门分三类：
 *   1) brand 自证（apply/verify --selftest）—— 校验脚本自身的正反例
 *   2) 工作副本红线（--debrand-check + 4 条 git grep 反向断言，命中即失败）
 *   3) 产物基线比对（--baseline-check）—— 自有面漂移即阻断
 *
 * 断言的判定口径与 brand.json → debranding.assert 保持一致；
 * 两者若不一致，以 brand.json（唯一事实源）为准，并同步修改本脚本。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
}

const workRel = typeof opt.work === 'string' ? opt.work : null;
if (!workRel) {
  console.error('用法：node .trae/skills/bidoda-upstream-customization/scripts/acceptance.mjs --work <源码工作副本> [--asar <app.asar>] [--baseline-id <id>] [--freeze]');
  process.exit(2);
}
const workAbs = path.resolve(ROOT, workRel);
const clientAbs = fs.existsSync(path.join(workAbs, 'client')) ? path.join(workAbs, 'client') : workAbs;
const asarAbs = typeof opt.asar === 'string' ? path.resolve(ROOT, opt.asar) : null;
const baselineId = typeof opt['baseline-id'] === 'string' ? opt['baseline-id'] : null;

const results = [];
const record = (name, ok, detail, level = 'gate') => {
  results.push({ name, ok, detail: detail || '', level });
  const tag = ok ? 'PASS' : (level === 'warn' ? 'WARN' : 'FAIL');
  console.log(`  ${tag}  ${name}${detail ? '  -> ' + String(detail).replace(/\s+/g, ' ').slice(0, 220) : ''}`);
};

const tail = (s, n = 12) => String(s || '').trim().split('\n').slice(-n).join(' | ');

function nodeRun(args) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function step(label, args, expectExit = 0) {
  const r = nodeRun(args);
  const ok = r.status === expectExit;
  record(label, ok, ok ? '' : `exit=${r.status} ${tail(r.stderr || r.stdout)}`);
  return ok;
}

console.log('bidoda 上游客户化 · 全量验收流水线');
console.log('='.repeat(64));
console.log('工作副本：' + path.relative(ROOT, clientAbs));
if (asarAbs) console.log('产物 asar：' + path.relative(ROOT, asarAbs) + '（baselineId=' + (baselineId || '(默认)') + '）');
console.log('-'.repeat(64));

// ---- 1) brand 自证 ----
console.log('[1] 校验脚本自证');
step('apply.mjs --selftest（换皮规则正反例）', ['brand/apply.mjs', '--selftest']);
step('verify.mjs --selftest（域同步/防杂交纯函数）', ['brand/verify.mjs', '--selftest']);

// ---- 2) 工作副本红线 ----
console.log('[2] 工作副本去标识化红线');
step('verify.mjs --debrand-check（51 条清单锚点 + 域名/文本断言）', ['brand/verify.mjs', '--debrand-check', clientAbs]);

const isRepo = spawnSync('git', ['-C', workAbs, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).status === 0;
// 反向断言：命中即失败（git grep exit 1 = 无命中 = 通过）。
// 第三列为 git pathspec 排除项，口径对齐 brand.json → debranding.assert.forbiddenDomainAllowFiles。
const GREPS = [
  ['旧运营标识残留（dependencyService.cjs 为已登记例外）', 'analytics\\.agnet\\.top|wiki\\.agnet\\.top|jlaudeapi|agnes-ai|v3\\.yibiao\\.pro', ['dependencyService.cjs']],
  ['docx 协议旧标签残留（应为 0）', 'YIBIAOANCHOR|YIBIAOTOC|YBPAGE:|yb_layout_|_YbP', []],
  ['openxmlhelper 旧命名空间残留（应为 0）', 'Yibiao\\.OpenXmlHelper', []],
  ['应用内自动更新组件未被挂载（应为 0）', 'import[^;]*UpdateNotifier|<UpdateNotifier|UpdateNotifierProvider', []],
];
if (!isRepo) {
  record('git 红线检查', false, '工作副本不是 git 仓库，无法执行 grep 反向断言', 'warn');
} else {
  for (const [label, pattern, excludes] of GREPS) {
    const args = ['-C', workAbs, 'grep', '-n', '-E', pattern];
    if (excludes.length) args.push('--', ...excludes.map(f => `:(exclude)*${f}`));
    const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // exit 0 = 有命中（失败）；1 = 无命中（通过）；>1 = git 报错
    if (r.status === 1) record(label, true);
    else if (r.status === 0) record(label, false, '命中 ' + String(r.stdout).trim().split('\n').length + ' 行，首行：' + String(r.stdout).trim().split('\n')[0]);
    else record(label, false, 'git 执行异常 exit=' + r.status + ' ' + tail(r.stderr));
  }
}

// ---- 3) 产物基线 ----
if (asarAbs) {
  console.log('[3] 产物基线（防覆盖 / 防回退）');
  if (!fs.existsSync(asarAbs)) {
    record('产物 app.asar 存在', false, path.relative(ROOT, asarAbs));
  } else {
    if (opt.freeze) step('建产物基线 --freeze-baseline', ['brand/apply.mjs', '--freeze-baseline', '--asar', asarAbs].concat(baselineId ? ['--baseline-id', baselineId] : []));
    step('产物基线比对 --baseline-check', ['brand/verify.mjs', '--baseline-check', asarAbs].concat(baselineId ? ['--baseline-id', baselineId] : []));
  }
} else {
  console.log('[3] 产物基线：跳过（未提供 --asar）');
}

// ---- 汇总 ----
const failed = results.filter(r => !r.ok && r.level !== 'warn');
const warned = results.filter(r => !r.ok && r.level === 'warn');
console.log('-'.repeat(64));
console.log(`结论：${failed.length === 0 ? 'PASS' : 'FAIL'}（通过 ${results.filter(r => r.ok).length} 项，失败 ${failed.length} 项，警告 ${warned.length} 项）`);
if (failed.length) {
  console.log('未通过项：');
  for (const f of failed) console.log('  - ' + f.name + (f.detail ? '  ' + f.detail : ''));
  console.log('任一未通过即视为改动被覆盖或版本回退 —— 禁止出包。');
}
process.exit(failed.length === 0 ? 0 : 1);
