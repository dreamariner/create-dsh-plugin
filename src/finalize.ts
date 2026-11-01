// create-dsh-plugin :: 生成后收尾（pnpm install / git init / submodule / 后续指引）

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ScaffoldOptions } from './types.ts'

export interface FinalizeResult {
  installed: boolean
  gitInited: boolean
  protocolSubmodule: 'added' | 'skipped' | 'failed'
}

/** typert 协议声明源共享仓的默认 git URL。
 *  ⚠ 该仓是私有的：SSH 形态对配置了 GitHub SSH key 的协作者可用；给组织外的人
 *  用 --protocol-url 传他们有权限的 URL（或先公开该仓）。 */
export const PROTOCOL_REPO_URL = 'git@github.com:dreamariner/dsh-typert-protocol.git'

function git(cwd: string, args: string[], opts: { stdio: 'inherit' | 'ignore' | 'pipe' } = { stdio: 'ignore' }): { status: number | null; stdout: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts })
  return { status: r.status, stdout: (r.stdout ?? '').toString() }
}

export function finalize(opts: ScaffoldOptions): FinalizeResult {
  const result: FinalizeResult = { installed: false, gitInited: false, protocolSubmodule: 'skipped' }

  if (opts.git) {
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
    if (existsSync(join(opts.targetDir, 'packages', 'protocol', 'package.json'))) {
      result.protocolSubmodule = 'added'
    } else if (git(opts.targetDir, ['rev-parse', '--is-inside-work-tree']).status !== 0) {
      result.protocolSubmodule = 'failed'
      console.error('[create-dsh-plugin] 未在 git 仓库中，无法自动挂载协议声明源 submodule（见下方手动命令）')
    } else {
      const r = git(opts.targetDir, ['submodule', 'add', '-b', 'main', url, 'packages/protocol'], { stdio: 'inherit' })
      result.protocolSubmodule = r.status === 0 ? 'added' : 'failed'
      if (r.status !== 0) {
        console.error('[create-dsh-plugin] 协议声明源 submodule 自动挂载失败（网络 / git 环境原因）——见下方手动命令')
      }
    }
  }

  if (opts.install) {
    const r = spawnSync('pnpm', ['install'], { cwd: opts.targetDir, stdio: 'inherit' })
    result.installed = r.status === 0
    if (!result.installed) {
      console.error('[create-dsh-plugin] pnpm install 失败（或 pnpm 不在 PATH）——请进入项目目录手动执行')
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

  const lines: string[] = [
    '',
    `✔ 插件项目已生成：${rel}`,
    '',
    '开发循环：',
    `  cd ${rel}`,
    '  pnpm dev          # watch 构建（保存即重建 lib/）',
  ]
  if (hasHost) {
    lines.push('  pnpm dev:hmr      # 把 lib/ 注册进本机 home patch 的 hmr watch 根（重启实例一次生效，之后宿主半边免重启）')
  }
  if (hasClient) {
    lines.push('  # client 半边免注册：DSH 的 client-hmr 盯着 lib/client.js，重建即热替换')
  }
  lines.push(
    '',
    '安装进 profile（desktop profile 不接受 CLI 转发时，用 pnpm 直调或 app 内 Plugin Manager）：',
    `  dsh plugin --profile <name> add ${opts.packageName}`,
    '  # 或从 git：dsh plugin --profile <name> add github:dreamariner/<repo>',
    '',
    '发布：',
    '  pnpm publish      # prepare 自动构建 lib/ 后打包；scoped 包已配 access=public',
  )
  if (opts.type === 'full' && result.protocolSubmodule !== 'added') {
    lines.push(
      '',
      '⚠ 协议声明源 submodule（packages/protocol）未挂载，typert codegen 依赖它。进入项目目录手动补挂：',
      `  git submodule add -b main ${PROTOCOL_REPO_URL} packages/protocol`,
    )
  }
  if (opts.install && !result.installed) {
    lines.push('', '⚠ 依赖未装好：先 cd 进项目跑 pnpm install')
  }
  if (result.gitInited) {
    lines.push(`  git -C ${rel} add -A && git -C ${rel} commit -m "chore: scaffold ${opts.packageName}"`)
  }
  lines.push('', '详细说明见项目内 README.md。')
  console.log(lines.join('\n'))
}

