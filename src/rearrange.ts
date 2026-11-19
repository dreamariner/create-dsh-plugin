// create-dsh-plugin :: 跨形态重排时的目录清理
//
// 为什么需要：create --dir 指向非空仓 = 跨形态重排（单包 → workspace 等）。渲染只会
// 「往上盖」，旧布局留下的路径会一直躺在仓根（src/ tests/ locale/ icon.svg
// cordis.patch.yml tsdown.config.ts），仓根看着像两种布局叠在一起；更糟的是渲染
// 阶段会用模板盖掉用户已有的源码（重排前 src/index.ts 里是用户写的逻辑）。
//
// 三条纪律：
//   ① 用户可编辑的内容面（src/ tests/ locale/ icon.svg）**不覆盖**：重排时渲染只补
//      缺失的文件，绝不拿模板盖掉用户的代码；
//   ② 旧布局的插件内容**搬运**到新布局的插件位置（用户版覆盖模板版），护栏 spec
//      除外（它们的内容随布局变，用新布局的模板版）；
//   ③ 搬完删掉旧路径，仓根只剩新布局的结构。
//
// 纪律 ② 的代价（明说，不藏）：同名文件以用户的版本为准，新形态新增的结构可能因此
// 缺件（例如 host → full 时 full 模板带的 typert face）。此时护栏会红，那正是它该
// 做的事：提醒用户手动合入，而不是让脚手架替用户合并代码。

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 仓的布局形态。 */
export type Layout = 'single' | 'workspace'

/** 用户可编辑的内容面：重排时渲染不覆盖（模板只补缺失的）。 */
export const USER_CONTENT_DIRS = ['src', 'tests', 'locale'] as const

/** 护栏 spec（脚手架生成、内容随布局变）：重排时不搬旧文件，用新布局的模板版。 */
const GUARD_SPECS = new Set([
  'tests/setup.ts',
  'tests/bundle-shape.spec.ts',
  'tests/client-boundary.spec.ts',
  'tests/import-guard.spec.ts',
  'tests/protocol-vendor.spec.ts',
  'tests/typert-face-install.spec.ts',
])

export interface RearrangeResult {
  /** 是否真的做了清理（同布局重排 = 只需重渲染，不搬不删） */
  ran: boolean
  from: Layout
  to: Layout
  /** 搬到新位置的旧文件（相对仓根） */
  moved: string[]
  /** 与新形态模板同名、需要用户手动合并的文件（模板版存为 <文件>.template） */
  conflicts: string[]
  /** 删掉的旧路径（相对仓根） */
  removed: string[]
  /** 需要用户人工处理的点 */
  warnings: string[]
}

/** 旧布局判定：workspace = 有 pnpm-workspace.yaml 且有 packages/；single = 根 manifest
 *  带 dsh.bundle（根即插件包）。判定不出来（不是脚手架生成的仓）= undefined，此时
 *  一律不动用户的目录。 */
export function detectOldLayout(dir: string): Layout | undefined {
  if (!existsSync(dir)) return undefined
  if (existsSync(join(dir, 'pnpm-workspace.yaml')) && existsSync(join(dir, 'packages'))) return 'workspace'
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath) || existsSync(join(dir, 'packages'))) return undefined
  try {
    const manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dsh?: { bundle?: unknown } }
    return manifest.dsh?.bundle !== undefined ? 'single' : undefined
  } catch {
    return undefined
  }
}

/** 目标路径是否落在「用户可编辑的内容面」（渲染阶段据此不覆盖）。 */
export function isUserContentPath(rel: string): boolean {
  const segs = rel.split('/')
  return USER_CONTENT_DIRS.some((d) => segs.includes(d)) || rel.endsWith('icon.svg')
}

/** 收集源目录下要搬运的文件（相对源根）：排除护栏 spec。 */
function collectUserFiles(srcRoot: string): string[] {
  const out: string[] = []
  const walk = (rel: string): void => {
    const abs = join(srcRoot, rel)
    let st
    try { st = statSync(abs) } catch { return }
    if (st.isDirectory()) {
      for (const entry of readdirSync(abs)) walk(join(rel, entry))
    } else {
      if (!GUARD_SPECS.has(rel)) out.push(rel)
    }
  }
  for (const top of [...USER_CONTENT_DIRS, 'icon.svg']) walk(top)
  return out
}

/** 搬运：用户版占位（用户代码优先），新形态的模板版同名时备份成 <文件>.template，
 *  两边都留：用户照模板版把新形态新增的结构（full 的 typert face 等）合进来。 */
function moveFiles(srcRoot: string, dstRoot: string, files: string[]): { moved: string[]; conflicts: string[] } {
  const moved: string[] = []
  const conflicts: string[] = []
  for (const rel of files) {
    const from = join(srcRoot, rel)
    const to = join(dstRoot, rel)
    if (existsSync(to)) {
      copyFileSync(to, `${to}.template`)
      conflicts.push(rel)
    }
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    moved.push(rel)
  }
  return { moved, conflicts }
}

function removePaths(root: string, rels: string[]): string[] {
  const removed: string[] = []
  for (const rel of rels) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    rmSync(abs, { recursive: true, force: true })
    removed.push(rel)
  }
  return removed
}

export interface RearrangeInput {
  pluginId: string
  packageName: string
  /** 重排前的根 manifest 包名（判断身份是否变了：变了则 bundle patch 不能搬） */
  oldPackageName?: string
}

/**
 * 跨形态重排的目录清理：把旧布局的插件内容搬到新布局的插件位置，再删掉旧路径。
 * 同布局（from === to）不搬不删，只靠渲染阶段的不覆盖规则保住用户内容。
 */
export function cleanupRearrangedLayout(dir: string, input: RearrangeInput, from: Layout, to: Layout): RearrangeResult {
  const result: RearrangeResult = { ran: false, from, to, moved: [], conflicts: [], removed: [], warnings: [] }
  if (from === to) return result

  if (from === 'single' && to === 'workspace') {
    const dst = join(dir, 'packages', input.pluginId)
    const moved = moveFiles(dir, dst, collectUserFiles(dir))
    result.moved = moved.moved
    result.conflicts = moved.conflicts
    // 旧单包布局留在根的路径：内容面（已搬走）+ 旧 tsdown.config.ts（单配置，workspace
    // 布局没有根级 tsdown 配置）+ 旧 lib/（构建产物，已过时）
    result.removed = removePaths(dir, ['src', 'tests', 'locale', 'icon.svg', 'tsdown.config.ts', 'lib'])
    // bundle patch 带插件行 id（= 包名/插件 id）：包名变了就不能搬（行 id 会与新 manifest
    // 对不上，护栏会红）。包名没变则连它一起搬过去。
    const oldPatch = join(dir, 'cordis.patch.yml')
    if (existsSync(oldPatch)) {
      if (input.oldPackageName === undefined || input.oldPackageName === input.packageName) {
        copyFileSync(oldPatch, join(dst, 'cordis.patch.yml'))
        result.moved.push('cordis.patch.yml')
        result.removed.push(...removePaths(dir, ['cordis.patch.yml']))
      } else {
        result.warnings.push(
          `包名从 ${input.oldPackageName} 变成 ${input.packageName}，根目录的 cordis.patch.yml（插件行 id 随包名）未搬运，`
          + '已用新模板版本；你若在旧 patch 里加过自己的行，请自行合入 packages/<id>/cordis.patch.yml',
        )
        result.removed.push(...removePaths(dir, ['cordis.patch.yml']))
      }
    }
    result.ran = true
    return result
  }

  if (from === 'workspace' && to === 'single') {
    const src = join(dir, 'packages', input.pluginId)
    if (!existsSync(src)) {
      result.warnings.push(`旧插件包目录不存在（packages/${input.pluginId}），未做清理`)
      return result
    }
    const others = readdirSync(join(dir, 'packages'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== input.pluginId && e.name !== 'protocol')
      .map((e) => e.name)
    if (others.length > 0) {
      result.warnings.push(
        `packages/ 里还有别的插件包（${others.join(', ')}），未清理旧布局：workspace → single 会把仓根变成插件包，`
        + '留着多个插件包没有确定语义，要不要留由你决定',
      )
      return result
    }
    const moved = moveFiles(src, dir, collectUserFiles(src))
    result.moved = moved.moved
    result.conflicts = moved.conflicts
    result.removed = removePaths(src, ['src', 'tests', 'locale', 'icon.svg', 'cordis.patch.yml', 'lib'])
    result.removed.push(...removePaths(dir, [`packages/${input.pluginId}`]))
    result.removed.push(...removePaths(dir, ['pnpm-workspace.yaml']))
    result.removed.push(...removePaths(dir, ['packages']))
    result.ran = true
    return result
  }

  return result
}
