// create-dsh-plugin :: 生成后收尾（pnpm install / git init / 后续指引）

import { spawnSync } from 'node:child_process'
import type { ScaffoldOptions } from './types.ts'

export interface FinalizeResult {
  installed: boolean
  gitInited: boolean
}

export function finalize(opts: ScaffoldOptions): FinalizeResult {
  const result: FinalizeResult = { installed: false, gitInited: false }

  if (opts.install) {
    const r = spawnSync('pnpm', ['install'], { cwd: opts.targetDir, stdio: 'inherit' })
    result.installed = r.status === 0
    if (!result.installed) {
      console.error('[create-dsh-plugin] pnpm install 失败（或 pnpm 不在 PATH）——请进入项目目录手动执行')
    }
  }

  if (opts.git) {
    const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: opts.targetDir, encoding: 'utf8' })
    if (inside.status === 0 && inside.stdout.trim() === 'true') {
      console.log('[create-dsh-plugin] 目标已在 git 仓库内，跳过 git init')
    } else {
      const r = spawnSync('git', ['init'], { cwd: opts.targetDir, stdio: 'ignore' })
      result.gitInited = r.status === 0
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
  if (opts.install && !result.installed) {
    lines.push('', '⚠ 依赖未装好：先 cd 进项目跑 pnpm install')
  }
  if (result.gitInited) {
    lines.push(`  git -C ${rel} add -A && git -C ${rel} commit -m "chore: scaffold ${opts.packageName}"`)
  }
  lines.push('', '详细说明见项目内 README.md。')
  console.log(lines.join('\n'))
}
