// create-dsh-plugin :: 生成后收尾（pnpm install / git init / submodule / 根接线 / 后续指引）
//
// create：git init（可选）→ full 挂协议 submodule → 重排迁移（对既有仓）→ pnpm install；
// add：full 按需挂协议 submodule + 把新插件的 typert face 追加进 tsconfig.host.json
//      → pnpm install（链接新插件包）。

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { renderTemplateText } from './render.ts'
import type { ScaffoldOptions } from './types.ts'

/** 对既有仓做 workspace 重排时，本机 DSH profile 里旧装法（link:<仓根>）的迁移记录。 */
export interface ProfileMigration {
  /** profile 目录名（~/.dsh/profiles/ 下） */
  profile: string
  /** 原依赖值（link:<仓根>） */
  from: string
  /** 新依赖值（link:<仓根>/packages/<id>） */
  to: string
  /** 旧根 manifest 包名 ≠ 新插件包名时，dependencies 键与 bundles 名单一并迁移 */
  renamed: boolean
  /** 迁移后的 pnpm install 是否成功（false 时 errors 里会给手动命令） */
  installed: boolean
}

export interface ProfileMigrationReport {
  /** 仅 create 且目标目录原本非空（重排）时为 true */
  ran: boolean
  migrated: ProfileMigration[]
  /** install 失败等需要人工介入的项（附手动命令） */
  errors: string[]
}

export interface FinalizeResult {
  installed: boolean
  gitInited: boolean
  /** added = 已就位（本次挂载或本来就在）；failed = 缺失且自动挂载失败（要手工补） */
  protocolSubmodule: 'added' | 'skipped' | 'failed'
  /** add 模式对 tsconfig.host.json 的处理结果（非 full 恒 skipped） */
  hostFace: 'wired' | 'created' | 'skipped' | 'failed'
  /** 重排迁移报告（非重排恒 ran: false） */
  migration: ProfileMigrationReport
}

/** typert 协议声明源共享仓的默认 git URL。
 *  ⚠ 该仓是私有的：SSH 形态对配置了 GitHub SSH key 的协作者可用；给组织外的人
 *  用 --protocol-url 传他们有权限的 URL（或先公开该仓）。 */
export const PROTOCOL_REPO_URL = 'git@github.com:dreamariner/dsh-typert-protocol.git'

function git(cwd: string, args: string[], opts: { stdio: 'inherit' | 'ignore' | 'pipe' } = { stdio: 'ignore' }): { status: number | null; stdout: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts })
  return { status: r.status, stdout: (r.stdout ?? '').toString() }
}

/** full 形态：确保 typert 协议声明源以 submodule 挂载 packages/protocol（生成器结构性要求
 *  该路径）。已在位则幂等跳过；git 环境可用就自动挂；不行则返回 failed（打印手动命令）。 */
function ensureProtocolSubmodule(dir: string, url: string): 'added' | 'failed' {
  if (existsSync(join(dir, 'packages', 'protocol', 'package.json'))) return 'added'
  if (git(dir, ['rev-parse', '--is-inside-work-tree']).status !== 0) {
    console.error('[create-dsh-plugin] 未在 git 仓库中，无法自动挂载协议声明源 submodule（见下方手动命令）')
    return 'failed'
  }
  const r = git(dir, ['submodule', 'add', '-b', 'main', url, 'packages/protocol'], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('[create-dsh-plugin] 协议声明源 submodule 自动挂载失败（网络 / git 环境原因）:见下方手动命令')
    return 'failed'
  }
  return 'added'
}

/** add(full)：把新插件的 typert face 挂进根聚合配置。tsconfig.host.json 缺失
 *  （host / client 仓收到第一个 full 插件）时按模板现生成；已存在则把新引用追加进
 *  references（纯文本插入：该文件带注释，不是合法 JSON，不能 JSON.parse 往返）。
 *  导出供单测直接驱动（不经过 finalize 的 git / install 副作用）。 */
export function wireHostFaceConfig(dir: string, pluginId: string, type: ScaffoldOptions['type']): FinalizeResult['hostFace'] {
  if (type !== 'full') return 'skipped'
  const hostPath = join(dir, 'tsconfig.host.json')
  const ref = `    { "path": "packages/${pluginId}/tsconfig.typert.json" }`
  if (!existsSync(hostPath)) {
    // 仓库此前没有 full 插件：按模板现生成（references = protocol + 本插件）
    writeFileSync(hostPath, renderTemplateText(
      join(import.meta.dirname, '..', 'templates', 'full', 'tsconfig.host.json.tpl'),
      'full',
      { __PLUGIN_ID__: pluginId },
    ))
    return 'created'
  }
  const text = readFileSync(hostPath, 'utf8')
  if (text.includes(`packages/${pluginId}/tsconfig.typert.json`)) return 'skipped'
  const close = text.lastIndexOf(']')
  if (close < 0) return 'failed'
  const head = text.slice(0, close).replace(/\s+$/, '')
  // 空数组（head 以 [ 结尾）不加逗号；非空给上一行补逗号再插入
  const needsComma = !head.endsWith('[')
  writeFileSync(hostPath, `${head}${needsComma ? ',' : ''}\n${ref}\n  ${text.slice(close)}`)
  return 'wired'
}

/** DSH home（与 DSH 的 resolveDshHome 同规则）：环境变量优先，回落 ~/.dsh。 */
export function defaultDshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/**
 * 重排迁移：把本机 DSH profile 里「link:<仓根>」形态的旧安装迁到新布局。
 *
 * 旧单包仓的唯一装法是 link:<仓根>。workspace 重排后根 manifest 被换成根壳
 * （无 dsh.bundle，包名变 <项目名>-workspace），loader 静默跳过——无报错、无日志、
 * 实例不重启连失效都不暴露（2026-11-01 minimax 实例）。pnpm 对 link: 依赖不跑
 * 生命周期脚本，所以根壳没有任何钩子能在被误装时喊出来；唯一可靠的修复时机就是
 * 重排本身：此刻旧 link 值还指向本仓，按 realpath 精确匹配后原地迁走。
 *
 * 迁移动作 = 依赖值改指 packages/<id>；旧包名 ≠ 新包名时连 dependencies 键与
 * dsh.profile.bundles 名单一起改名。改完跑一次 profile 的 pnpm install 让 symlink
 * 真正重指。npm 发布版不受重排影响（tarball 是快照），github 克隆安装同理，均无需迁。
 */
export function migrateRootLinkInstalls(
  opts: Pick<ScaffoldOptions, 'targetDir' | 'pluginId' | 'packageName'>,
  homeDir: string = defaultDshHome(),
  runInstall = true,
): ProfileMigrationReport {
  const report: ProfileMigrationReport = { ran: true, migrated: [], errors: [] }
  const profilesDir = join(homeDir, 'profiles')
  let rootReal: string
  try { rootReal = realpathSync(opts.targetDir) } catch { return report }
  if (!existsSync(profilesDir)) return report

  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const profileDir = join(profilesDir, entry.name)
    const pkgPath = join(profileDir, 'package.json')
    if (!existsSync(pkgPath)) continue
    let manifest: Record<string, any>
    try { manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch {
      report.errors.push(`${entry.name}: package.json 不是合法 JSON，跳过（需人工检查）`)
      continue
    }
    const deps = manifest.dependencies as Record<string, string> | undefined
    if (!deps) continue

    for (const [key, value] of Object.entries(deps)) {
      if (typeof value !== 'string' || !value.startsWith('link:')) continue
      let valueReal: string
      try { valueReal = realpathSync(value.slice('link:'.length)) } catch { continue }
      if (valueReal !== rootReal) continue

      // 命中旧装法：迁移值 + （必要时）迁移包名键与 bundles 名单
      const newPath = `${value.replace(/\/+$/, '')}/packages/${opts.pluginId}`
      const renamed = key !== opts.packageName
      if (renamed) {
        delete deps[key]
        deps[opts.packageName] = newPath
        const bundles = manifest.dsh?.profile?.bundles
        if (Array.isArray(bundles)) {
          const i = bundles.indexOf(key)
          if (i >= 0) bundles[i] = opts.packageName
        }
      } else {
        deps[key] = newPath
      }
      writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + '\n')

      let installed = true
      if (runInstall) {
        const r = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: profileDir, encoding: 'utf8' })
        installed = r.status === 0
        if (!installed) {
          report.errors.push(
            `${entry.name}: 迁移后 pnpm install 失败。手动收尾：cd ${profileDir} && pnpm install`
            + `（依赖值已改写为 ${newPath}）`,
          )
        }
      }
      report.migrated.push({ profile: entry.name, from: value, to: newPath, renamed, installed })
      break // 一个 profile 里同一仓只可能装一次
    }
  }
  return report
}

export function finalize(
  opts: ScaffoldOptions,
  pre?: { wasNonEmpty?: boolean; oldPackageName?: string | null },
): FinalizeResult {
  const result: FinalizeResult = {
    installed: false, gitInited: false, protocolSubmodule: 'skipped', hostFace: 'skipped',
    migration: { ran: false, migrated: [], errors: [] },
  }

  if (opts.git && opts.command === 'create') {
    const inside = git(opts.targetDir, ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    if (inside.status === 0 && inside.stdout.trim() === 'true') {
      console.log('[create-dsh-plugin] 目标已在 git 仓库内，跳过 git init')
    } else if (git(opts.targetDir, ['init']).status === 0) {
      result.gitInited = true
    }
  }

  // 重排迁移：先于 pnpm install（迁的是外部 profile，与本仓安装互不影响）。
  // pre.wasNonEmpty 在渲染前采样（渲染后目录必然非空），oldPackageName 是被覆盖前
  // 的根 manifest 名，用于识别需要连键一起迁移的形态。
  if (opts.command === 'create' && pre?.wasNonEmpty) {
    result.migration = migrateRootLinkInstalls(opts, undefined, true)
  }

  // full 形态：typert 协议声明源以 submodule 挂载 packages/protocol（生成器结构性要求
  // 该路径）。git 环境可用就自动挂；不行则打印手动命令（后续任何位置都能补挂）。
  if (opts.type === 'full') {
    const url = opts.protocolUrl ?? PROTOCOL_REPO_URL
    result.protocolSubmodule = ensureProtocolSubmodule(opts.targetDir, url)
    // add 模式：把新插件的 typert face 追加进 tsconfig.host.json（缺失则按模板现生成）
    result.hostFace = wireHostFaceConfig(opts.targetDir, opts.pluginId, opts.type)
  }

  if (opts.install) {
    // 显式关 frozen-lockfile：create 首装无锁文件、add 必改 lockfile，CI 环境
    // （pnpm 默认 frozen）下不带这个参数必然失败
    const r = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: opts.targetDir, stdio: 'inherit' })
    result.installed = r.status === 0
    if (!result.installed) {
      console.error('[create-dsh-plugin] pnpm install 失败（或 pnpm 不在 PATH）:请进入项目目录手动执行')
    }
  }

  return result
}

/** 相对当前 cwd 的显示路径（同 cwd 下短显示，跨目录显示绝对路径）。 */
export function displayPath(dir: string): string {
  return dir.startsWith(process.cwd()) ? dir.slice(process.cwd().length + 1) : dir
}

export function printNextSteps(opts: ScaffoldOptions, result: FinalizeResult, wasNonEmpty = false): void {
  const rel = displayPath(opts.targetDir)
  const hasHost = opts.type === 'host' || opts.type === 'full'
  const hasClient = opts.type === 'client' || opts.type === 'full'
  const isAdd = opts.command === 'add'

  const lines: string[] = [
    '',
    isAdd ? `✔ 插件包已追加：packages/${opts.pluginId}（仓根：${rel}）` : `✔ 插件项目已生成：${rel}`,
    '',
    '开发循环（根壳按 workspace 递归转发，追加插件后无需改命令）：',
    `  cd ${rel}`,
    '  pnpm dev          # watch 构建全部插件包（保存即重建 lib/）',
  ]
  if (hasHost) {
    lines.push('  pnpm dev:hmr      # 把各包 lib/ 注册进本机 home patch 的 hmr watch 根（重启实例一次生效，之后宿主半边免重启）')
  }
  if (hasClient) {
    lines.push('  # client 半边免注册：DSH 的 client-hmr 盯着 lib/client.js，重建即热替换')
  }
  lines.push(
    '',
    '安装进 profile（方式一，推荐：CLI = 装包 + 登记 bundle 名单一步到位）：',
    `  dsh plugin --profile <name> add ${opts.packageName}`,
    '  方式二（desktop profile 不接受 CLI 转发 / git 子目录语法 CLI 不认时），手动两步：',
    `  pnpm add "github:<owner>/<repo>#path:packages/${opts.pluginId}" --dir <profile目录>   # ① 装包`,
    `  # ② 把 "${opts.packageName}" 补进 profile package.json 的 dsh.profile.bundles`,
    '  #    （裸 pnpm add 只装包不登记：profile 只认这份名单，不登记插件不挂载）',
    '',
    '发布（单插件包）：',
    `  pnpm --filter ${opts.packageName} publish   # prepare 同步 README/LICENSE 并构建 lib/`,
  )
  if (opts.type === 'full' && result.protocolSubmodule !== 'added') {
    lines.push(
      '',
      '⚠ 协议声明源 submodule（packages/protocol）未挂载，typert codegen 依赖它。进入项目目录手动补挂：',
      `  git submodule add -b main ${PROTOCOL_REPO_URL} packages/protocol`,
    )
  }
  if (result.migration.ran) {
    if (result.migration.migrated.length > 0) {
      lines.push('', '♻ 重排迁移：已把本机 DSH profile 里的旧装法（link:<仓根>）迁到新布局：')
      for (const m of result.migration.migrated) {
        lines.push(
          `  · ${m.profile}: ${m.from} → ${m.to}${m.renamed ? '（包名 key + bundles 名单已同步改名）' : ''}`
            + `${m.installed ? '（pnpm install 完成）' : '（⚠ pnpm install 失败，见下）'}`,
        )
      }
      lines.push('  对运行中的实例：重启一次才生效（运行中实例持有旧模块）。')
    }
    if (result.migration.errors.length > 0) {
      for (const e of result.migration.errors) lines.push(`  ⚠ ${e}`)
    }
    if (result.migration.migrated.length === 0 && result.migration.errors.length === 0) {
      // 没找到可迁的：仍可能有本扫描覆盖不到的形态（别的机器、github 克隆、手动软链），
      // 保留一句提示而不是无声通过。
      lines.push(
        '',
        '⚠ 本机 DSH profile 里没扫到 link:<仓根> 形态的旧安装。若这个仓曾被别的形态安装'
          + '（github 克隆、他机 profile、手工软链），重排后同样会静默失效，需按上方安装节重装。',
      )
    }
  }
  if (result.hostFace === 'failed') {
    lines.push(
      '',
      '⚠ tsconfig.host.json 的 references 追加失败（文件结构异常），typert face 需手工补一行：',
      `  { "path": "packages/${opts.pluginId}/tsconfig.typert.json" }`,
    )
  }
  if (opts.install && !result.installed) {
    lines.push('', '⚠ 依赖未装好：先 cd 进项目跑 pnpm install')
  }
  if (result.gitInited) {
    lines.push(`  git -C ${rel} add -A && git -C ${rel} commit -m "chore: scaffold ${opts.packageName}"`)
  }
  lines.push('', isAdd ? '继续追加插件：npx @dreamariner/create-dsh-plugin add <包名> --type host|client|full（在仓根执行）' : `追加更多插件：npx @dreamariner/create-dsh-plugin add <包名> --type host|client|full（在仓根执行）`, '', '详细说明见项目内 README.md。')
  console.log(lines.join('\n'))
}
