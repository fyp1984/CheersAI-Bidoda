/**
 * app.asar 逐文件 sha256 清单（内存解析，零落盘）。
 *
 * 服务于 Windows 源码构建路线的产物基线：
 *   apply.mjs  --freeze-baseline --asar <app.asar> --baseline-id <id>   建立基线
 *   verify.mjs --baseline-check <app.asar> [--baseline-id <id>]          基线比对
 *
 * 解析完全对齐 @electron/asar 头部格式：8 字节 pickle 头 + headerSize 头 + 数据区。
 * 之所以不走 extractAll：本产物含 2.6 万+ 文件（node_modules 占绝大多数），
 * 逐文件写盘在沙箱内会被拖慢乃至杀掉（见 verify.mjs 同一取舍）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let cachedAsar;
/**
 * 定位 @electron/asar。本工程未在根目录安装它；它随 client 构建副本的 node_modules 提供。
 * 解析顺序：BIDODA_ASAR_MODULE 环境变量 -> 常规解析 -> work/<任意构建副本>/client/node_modules。
 */
export async function loadAsar() {
  if (cachedAsar) return cachedAsar;
  const req = createRequire(path.join(HERE, 'asar-manifest.mjs'));
  const candidates = [];
  if (process.env.BIDODA_ASAR_MODULE) candidates.push(process.env.BIDODA_ASAR_MODULE);
  try { candidates.push(req.resolve('@electron/asar')); } catch { /* 根目录未安装 */ }
  const work = path.join(ROOT, 'work');
  if (fs.existsSync(work)) {
    for (const d of fs.readdirSync(work).sort()) {
      const p = path.join(work, d, 'client', 'node_modules', '@electron', 'asar', 'lib', 'asar.js');
      if (fs.existsSync(p)) candidates.push(p);
    }
  }
  for (const c of candidates) {
    try {
      const m = await import(pathToFileURL(c).href);
      cachedAsar = m.getRawHeader ? m : (m.default || m);
      return cachedAsar;
    } catch { /* 试下一个候选 */ }
  }
  throw new Error('缺少 @electron/asar。可用 BIDODA_ASAR_MODULE 指定路径，或在构建副本 work/<ver>/client 内 npm ci。候选：' + candidates.join(' | '));
}

/** 返回 { manifest: {相对路径: sha256}, fileCount }。相对路径一律用 / 分隔。 */
export async function asarManifest(asarPath) {
  const asar = await loadAsar();
  const raw = asar.getRawHeader(asarPath);
  const dataStart = 8 + raw.headerSize;
  const dataSize = fs.statSync(asarPath).size - dataStart;
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
      if ('link' in node) continue;                                 // 符号链接无独立内容
      if ('offset' in node || node.unpacked === true) files.push({ rel, node });
    }
  };
  walkHdr(raw.header.files, '');
  const manifest = {};
  for (const { rel, node } of files) manifest[rel] = crypto.createHash('sha256').update(readNode(rel, node)).digest('hex');
  return { manifest, fileCount: files.length };
}

/** 产物自有面：node_modules 为第三方（lockfile 钉版），其漂移单列为信息性而非阻断级 */
export function isAppSurface(rel) { return !/^node_modules\//.test(rel); }
