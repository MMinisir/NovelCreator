/**
 * 桌面版一键打包脚本（便携版 / 安装包共用同一套流程）：
 * 1. 升级版本号（默认 patch，可 --minor / --major / --version=x.y.z；加 --no-bump 则沿用当前版本）
 * 2. 以 electron 模式构建前端（tsc -b + vite build --mode electron）
 * 3. 用 electron-builder 生成产物（输出到系统临时目录，避免污染项目）
 *    - 默认：单文件便携版 portable → NovelCreator-v<version>.exe
 *    - --installer：NSIS 安装包 nsis → NovelCreator-Setup-v<version>.exe
 * 4. 把产物复制到 release-desktop/；清理**其它版本**与中间产物（同一版本的多种格式会一起保留）
 *
 * 用法：
 *   npm run dist:exe                       # 便携版，0.1.5 → 0.1.6
 *   npm run dist:exe -- --minor            # 便携版，0.1.5 → 0.2.0
 *   npm run dist:exe -- --major            # 便携版，0.1.5 → 1.0.0
 *   npm run dist:exe -- --version=2.3.4    # 便携版，指定版本号
 *   npm run dist:setup                     # 安装包，沿用当前版本（= --installer --no-bump）
 *   npm run dist:exe -- --installer        # 安装包，并升级版本号
 *
 * 说明：子进程一律通过 `node <本地 CLI 入口>` 执行（不经 npm.cmd / shell），
 * 以免 Windows 下 Node ≥20 禁止 spawn .cmd 的限制，并规避 `${version}` 这类宏被 shell 转义。
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const NODE = process.execPath
const PKG_PATH = path.join(root, 'package.json')
/** 最终产物目录 */
const OUT_DIR = path.join(root, 'release-desktop')

const args = process.argv.slice(2)
const versionArg = args.find((a) => a.startsWith('--version='))?.slice('--version='.length)
const bumpKind = args.includes('--major') ? 'major' : args.includes('--minor') ? 'minor' : 'patch'
/** 打 NSIS 安装包（默认打单文件便携版） */
const wantInstaller = args.includes('--installer') || args.includes('--nsis')
/** 沿用当前版本号（为已有版本补另一种格式时用） */
const noBump = args.includes('--no-bump')

/** 解析依赖包的可执行入口（node_modules/<pkg>/<bin>） */
function binEntry(pkgName, binName) {
  const dir = path.join(root, 'node_modules', pkgName)
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const bin = pkg.bin
  const rel = typeof bin === 'string' ? bin : (bin?.[binName] ?? Object.values(bin ?? {})[0])
  if (!rel) throw new Error(`无法解析 ${pkgName} 的可执行入口`)
  return path.join(dir, rel)
}

function runNode(entry, entryArgs) {
  execFileSync(NODE, [entry, ...entryArgs], { cwd: root, stdio: 'inherit' })
}

/** 语义化版本升级（默认 patch） */
function bumpVersion(version, kind) {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10) || 0)
  while (parts.length < 3) parts.push(0)
  const [major, minor, patch] = parts
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** 删除失败不中断（某些环境删除会被安全策略接管） */
function safeRemove(target) {
  try {
    rmSync(target, { recursive: true, force: true })
    console.log(`  已清理：${path.relative(root, target) || target}`)
  } catch (err) {
    console.warn(`  跳过清理（请稍后手动删除）：${target} → ${err?.code ?? err?.message ?? err}`)
  }
}

/** 在目录里找 exe（排除 blockmap 等附属文件） */
function findExe(dir) {
  const hits = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.exe') && !n.toLowerCase().endsWith('.blockmap'))
  return hits.length > 0 ? path.join(dir, hits[0]) : null
}

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
const prevVersion = pkg.version
const nextVersion = noBump ? prevVersion : (versionArg ?? bumpVersion(prevVersion, bumpKind))

if (!noBump && nextVersion === prevVersion) {
  console.error(`版本号未变化（${prevVersion}），请指定 --minor / --major / --version=x.y.z，或加 --no-bump 沿用当前版本`)
  process.exit(1)
}

const target = wantInstaller ? 'nsis' : 'portable'
const kindLabel = wantInstaller ? '安装包 NSIS' : '单文件便携版'
const artifactName = wantInstaller ? 'NovelCreator-Setup-v${version}.${ext}' : 'NovelCreator-v${version}.${ext}'
/** nsis / portable 各自的 artifactName 更具体，会覆盖 win.artifactName，所以按目标传对应键 */
const artifactFlag = wantInstaller
  ? `--config.nsis.artifactName=${artifactName}`
  : `--config.portable.artifactName=${artifactName}`

if (noBump) {
  console.log(`\n[1/5] 版本号：沿用当前版本 v${nextVersion}（--no-bump）`)
} else {
  console.log(`\n[1/5] 版本号：${prevVersion} → ${nextVersion}`)
  pkg.version = nextVersion
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
}

console.log('[2/5] 构建前端（electron 模式）')
runNode(binEntry('typescript', 'tsc'), ['-b'])
runNode(binEntry('vite', 'vite'), ['build', '--mode', 'electron'])

// 输出到临时目录：目录名带版本与时间戳 → 每次全新，无需清空旧产物（避免被文件锁/安全策略拦住）
const stage = path.join(tmpdir(), `novelcreator-desktop-${nextVersion}-${Date.now()}`)
console.log(`[3/5] 打包${kindLabel}（临时目录：${stage}）`)
runNode(binEntry('electron-builder', 'electron-builder'), [
  '--win',
  target,
  `--config.directories.output=${stage}`,
  artifactFlag,
])

const builtExe = findExe(stage)
if (!builtExe) {
  console.error('未找到打包产物 exe，打包失败')
  process.exit(1)
}

console.log('[4/5] 复制产物到 release-desktop/')
mkdirSync(OUT_DIR, { recursive: true })
const finalExe = path.join(OUT_DIR, path.basename(builtExe))
copyFileSync(builtExe, finalExe)

console.log('[5/5] 清理旧版本与历史产物')
// 5.1 其它 release* 目录（历史打包目录）
for (const entry of readdirSync(root)) {
  if (!entry.startsWith('release')) continue
  const full = path.join(root, entry)
  if (entry === 'release-desktop' || !statSync(full).isDirectory()) continue
  safeRemove(full)
}
// 5.2 release-desktop 内：保留**当前版本**的全部产物（便携版 + 安装包可共存），删除旧版本与中间产物
const keepName = path.basename(finalExe)
for (const entry of readdirSync(OUT_DIR)) {
  if (entry === keepName) continue
  const full = path.join(OUT_DIR, entry)
  const lower = entry.toLowerCase()
  const isIntermediate =
    entry === 'win-unpacked' ||
    lower.endsWith('.yml') ||
    lower.endsWith('.blockmap') ||
    lower.endsWith('.tmp') ||
    lower.endsWith('.log')
  if (isIntermediate || !entry.includes(`v${nextVersion}`)) safeRemove(full)
}
// 5.3 临时打包目录
safeRemove(stage)

const sizeMb = (statSync(finalExe).size / 1024 / 1024).toFixed(1)
console.log(`\n✅ 打包完成：${path.relative(root, finalExe)}（${kindLabel}，v${nextVersion}，${sizeMb} MB）`)
if (noBump) {
  console.log('   提示：已按 --no-bump 沿用当前版本号，package.json 未改动。\n')
} else {
  console.log('   提示：package.json 的版本号已更新，记得随本次改动一起提交。\n')
}
