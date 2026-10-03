import { open, realpath, stat, lstat, rename, unlink, link } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { MAX_BYTES, parseRviz, convertRviz } from './rviz-converter';

const usage = `RViz2 → ROS2 Web 工作区（离线，只读输入）
用法：scripts/convert-rviz.sh INPUT.rviz --output OUTPUT.json [--report REPORT.json] [--force]
默认报告：OUTPUT.report.json；默认拒绝覆盖；--force 也不能覆盖输入。
相对路径按当前终端目录解析。转换后在 WebUI 点击“导入”，选择工作区 JSON（不是报告）。`;

async function canonical(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return join(await realpath(dirname(path)), basename(path)); }
}
async function info(path: string) {
  try { return await lstat(path); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; return undefined; }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) { console.log(usage); return; }
  let input: string | undefined, output: string | undefined, reportPath: string | undefined, force = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' || arg === '--report') {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少路径`);
      if (arg === '--output') { if (output) throw new Error('--output 重复'); output = value; }
      else { if (reportPath) throw new Error('--report 重复'); reportPath = value; }
    } else if (arg === '--force') force = true;
    else if (arg.startsWith('-') || input) throw new Error('参数无效；使用 --help 查看用法');
    else input = arg;
  }
  if (!input || !output) throw new Error('需要输入路径和 --output；使用 --help 查看用法');
  input = resolve(input); output = resolve(output);
  reportPath = resolve(reportPath ?? output.replace(/\.json$/i, '') + '.report.json');
  const inputStat = await stat(input);
  if (!inputStat.isFile() || inputStat.size > MAX_BYTES) throw new Error('输入不是普通文件或超过 2 MiB');
  const paths = [input, output, reportPath], identities = await Promise.all(paths.map(canonical));
  if (new Set(identities).size !== 3) throw new Error('输入/输出/报告不能是同一路径（含 symlink 等价）');
  const targets = await Promise.all([output, reportPath].map(info));
  for (let i = 0; i < targets.length; i++) {
    const s = targets[i]; if (!s) continue;
    if (!s.isFile()) throw new Error('已有输出必须是普通文件，不覆盖目录或 symlink');
    if (s.dev === inputStat.dev && s.ino === inputStat.ino) throw new Error('不能覆盖输入文件的 hardlink');
    if (!force) throw new Error('输出或报告已存在；选择新路径或明确使用 --force');
  }
  if (targets[0] && targets[1] && targets[0].dev === targets[1].dev && targets[0].ino === targets[1].ino) throw new Error('输出和报告不能是同一 hardlink');
  // Read at most MAX_BYTES+1 even if the input grows after stat; decode UTF-8 strictly.
  const handle = await open(input, 'r');
  let text: string;
  try {
    const buffer = Buffer.alloc(MAX_BYTES + 1); let length = 0;
    while (length < buffer.length) { const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null); if (!bytesRead) break; length += bytesRead; }
    if (length > MAX_BYTES) throw new Error('输入超过 2 MiB');
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
  const result = convertRviz(parseRviz(text));
  const payloads = [JSON.stringify(result.workspace, null, 2) + '\n', JSON.stringify(result.report, null, 2) + '\n'];
  if (Buffer.byteLength(payloads[0], 'utf8') > MAX_BYTES) throw new Error('工作区输出超过 2 MiB');
  const destinations = [output, reportPath], temps: string[] = [], committed: string[] = [];
  try {
    for (let i = 0; i < destinations.length; i++) {
      const temp = join(dirname(destinations[i]), `.rviz-convert-${randomUUID()}.tmp`), f = await open(temp, 'wx', 0o600);
      temps.push(temp); try { await f.writeFile(payloads[i], 'utf8'); await f.sync(); } finally { await f.close(); }
    }
    for (let i = 0; i < destinations.length; i++) {
      if (force) {
        // Recheck aliases just before replacement. Rename replaces the directory entry, never writes through a symlink.
        const current = await canonical(destinations[i]);
        if (current === identities[0] || current === identities[1 - i + 1]) throw new Error('输出路径在写入前发生别名变化');
        const s = await info(destinations[i]);
        if (s && (!s.isFile() || (s.dev === inputStat.dev && s.ino === inputStat.ino))) throw new Error('输出路径在写入前变为非普通文件或输入别名');
        await rename(temps[i], destinations[i]);
      } else {
        await link(temps[i], destinations[i]); // Atomic no-clobber publication on the same filesystem.
        await unlink(temps[i]);
      }
      committed.push(destinations[i]);
    }
  } catch (e) {
    if (committed.length) console.error(`注意：已生成 ${committed.join(', ')}；另一个文件写入失败，未承诺跨文件事务`);
    throw e;
  } finally { await Promise.all(temps.map(p => unlink(p).catch(() => undefined))); }
  console.log(`已转换 ${result.report.convertedLayers} 个图层；跳过 ${result.report.skippedDisplays} 个显示项；${result.report.warnings.length} 条提示`);
  console.log(`工作区：${output}\n转换报告：${reportPath}\n请在 WebUI 手动导入工作区 JSON。未启动 ROS、仿真或算法。`);
}
main().catch((error: unknown) => { console.error(`转换失败：${error instanceof Error ? error.message : '未知错误'}`); process.exitCode = 1; });
