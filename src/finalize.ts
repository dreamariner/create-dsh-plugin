// create-dsh-plugin :: 生成后收尾（pnpm install / git init / submodule / 根接线 / 后续指引）
//
// create：git init（可选）→ full 挂协议 submodule → pnpm install；
// add：full 按需挂协议 submodule + 把新插件的 typert face 追加进 tsconfig.host.json
//      → pnpm install（链接新插件包）。

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderTemplateText } from './render.ts'
import type { ScaffoldOptions } from './types.ts'

export interface FinalizeResult {
  installed: boolean
  gitInited: boolean
  /** added = 已就位（本次挂载或本来就在）；failed = 缺失且自动挂载失败（要手工补） */
  protocolSubmodule: 'added' | 'skipped' | 'failed'
  /** add 模式对 tsconfig.host.json 的处理结果（非 full 恒 skipped） */
  hostFace: 'wired' | 'created' | 'skipped' | 'failed'
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

export function finalize(opts: ScaffoldOptions): FinalizeResult {
  const result: FinalizeResult = { installed: false, gitInited: false, protocolSubmodule: 'skipped', hostFace: 'skipped' }

  if (opts.git && opts.command === 'create') {
    const inside = git(opts.targetDir, ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    if (inside.status === 0 && inside.stdout.trim() === 'true') {
      console.log('[create-dsh-plugin] 目标已在 git 仓库内，跳过 git init')
    } else if (git(opts.targetDir, ['init']).status === 0) {
      result.gitInited = true
    }
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

export function printNextSteps(opts: ScaffoldOptions, result: FinalizeResult): void {
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
    '安装进 profile（desktop profile 不接受 CLI 转发时，用 pnpm 直调或 app 内 Plugin Manager）：',
    `  dsh plugin --profile <name> add ${opts.packageName}`,
    '  # 从 git：workspace 仓的 dsh CLI github: 形态装的是仓根壳（无 dsh.bundle，',
    '  # 会被插件管理器跳过），用 pnpm 的 path: 语法直装插件包子目录：',
    `  pnpm add "github:<owner>/<repo>#path:packages/${opts.pluginId}" --dir <profile目录>`,
    '',
    '发布（单插件包）：',
    `  pnpm --filter ${opts.packageName} publish   # prepublishOnly 同步 README/LICENSE，prepare 构建 lib/`,
  )
  if (opts.type === 'full' && result.protocolSubmodule !== 'added') {
    lines.push(
      '',
      '⚠ 协议声明源 submodule（packages/protocol）未挂载，typert codegen 依赖它。进入项目目录手动补挂：',
      `  git submodule add -b main ${PROTOCOL_REPO_URL} packages/protocol`,
    )
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
