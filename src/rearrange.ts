// create-dsh-plugin :: 跨形态重排时的目录清理
//
// 为什么需要：create --dir 指向非空仓 = 跨形态重排（单包 → workspace 等）。渲染只会
// 「往上盖」，旧布局留下的路径会一直躺在仓根（src/ tests/ locale/ icon.svg
// cordis.patch.yml tsdown.config.ts），仓根看着像两种布局叠在一起；更糟的是渲染
// 阶段会用模板盖掉用户已有的源码（重排前 src/index.ts 里是用户写的逻辑）。
//
// 四条纪律：
//   ① 用户可编辑的内容面（src/ tests/ locale/ icon.svg）**不覆盖**：重排时渲染只补
//      缺失的文件，绝不拿模板盖掉用户的代码；
//   ② 旧布局的插件内容**搬运**到新布局的插件位置（用户版占位），机械护栏 spec 除外
//      （它们的内容随布局与形态变，用新形态的模板版；tests/setup.ts 不是护栏，是
//      模板明说让用户改的测试夹具，照用户内容搬运）；
//   ③ 与旧形态模板渲染结果**逐字节一致**的文件 = 未改动的模板文件，不搬运：直接
//      清理，让新形态的模板原位生效。否则连没改过演示代码的仓（full → host）都会
//      开箱构建红：搬过去的 remote.ts 值导入协议包，host / client 形态没有这个依赖；
//   ④ 搬完删掉旧路径（含旧布局的孤儿配置），仓根只剩新布局的结构。
//
// 纪律 ② 的代价（明说，不藏）：用户改过的代码照搬后，新形态缺的结构（full 的
// typert face 等）会让护栏 / 构建红。此时模板版备份在 <文件>.template、死半边检测
// 会把话说破：提醒用户手动合入，而不是让脚手架替用户合并代码。

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PluginType } from './types.ts'
import { buildPluginPlan, renderTemplateText, TEMPLATES } from './render.ts'

/** 仓的布局形态。 */
export type Layout = 'single' | 'workspace'

/** 用户可编辑的内容面：重排时渲染不覆盖（模板只补缺失的）。 */
export const USER_CONTENT_DIRS = ['src', 'tests', 'locale'] as const

/** 机械护栏 spec（脚手架生成、内容随布局与形态变）：重排时不搬旧文件，用新形态的
 *  模板版。它们编码的是不变量，用户不该改；改了也会被新形态的版本顶掉（这是对的）。
 *  ⚠ tests/setup.ts 不在此列：它是测试夹具且模板明说让用户改（清密钥、自定义隔离），
 *  按用户内容搬运，丢用户的改动是数据损失。 */
const GUARD_SPECS = new Set([
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
  /** 搬到新位置的旧文件（相对新位置；未改动的模板文件不在其中） */
  moved: string[]
  /** 与新形态模板同名、需要用户对照 .template 手动合并的文件（相对新位置） */
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

/** 收集源目录下要搬运的文件（相对源根）：排除机械护栏 spec。 */
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

/** 从收集到的文件推断旧形态：src/remote.ts 只有 full 模板会生成；src/client/index.tsx
 *  只有 client / full；都没有 = host。推断只服务「旧模板渲染比对」，错判的代价是
 *  把未改动文件当成用户代码照搬（保守方向，不会丢数据）。 */
function inferOldType(files: string[]): PluginType {
  if (files.includes('src/remote.ts')) return 'full'
  if (files.includes('src/client/index.tsx')) return 'client'
  return 'host'
}

/** 旧形态模板的 to → from 映射（to 按旧布局剥掉 packages/<id>/ 前缀）。 */
function templateMapFor(oldType: PluginType, pluginId: string, oldLayout: Layout): Map<string, string> {
  const prefix = oldLayout === 'workspace' ? `packages/${pluginId}/` : ''
  const map = new Map<string, string>()
  for (const f of buildPluginPlan(oldType, pluginId, oldLayout)) map.set(f.to.slice(prefix.length), f.from)
  return map
}

/** 文件内容是否与旧形态模板的当前渲染逐字节一致（= 未改动的模板文件）。读不到 /
 *  渲染失败一律按「用户代码」处理（保守方向：多搬不丢数据）。 */
function rendersToSameContent(srcRoot: string, rel: string, tplFrom: string, oldType: PluginType, sub: Record<string, string>, oldLayout: Layout): boolean {
  try {
    const current = readFileSync(join(srcRoot, rel), 'utf8')
    const rendered = renderTemplateText(join(TEMPLATES, tplFrom), oldType, sub, oldLayout)
    return current === rendered
  } catch {
    return false
  }
}

/** 搬运：用户版占位（用户代码优先）。同名冲突时分两类：
 *  - 代码面（src/ tests/）：新形态的模板版备份成 <文件>.template，两边都留（已有
 *    .template 不再覆盖：那是上次重排的备份，可能已被用户改过）；
 *  - locale/ 与 icon.svg：不备份。模板版是通用占位内容（脚手架随时可再生成），留着
 *    只会污染发布面：npm files 白名单的 locale 是整目录收录，en.json.template 会进
 *    tarball。
 *  conflicts 只收代码文件：locale / icon 用户的版本严格更优，没有「合并」可言。 */
function moveFiles(srcRoot: string, dstRoot: string, files: string[]): { moved: string[]; conflicts: string[] } {
  const moved: string[] = []
  const conflicts: string[] = []
  for (const rel of files) {
    const from = join(srcRoot, rel)
    const to = join(dstRoot, rel)
    const isCode = rel.startsWith('src/') || rel.startsWith('tests/')
    if (isCode && existsSync(to)) {
      if (!existsSync(`${to}.template`)) copyFileSync(to, `${to}.template`)
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
  /** 重排后的插件形态（workspace → single 方向用它判断哪些旧半边代码成了死代码） */
  newType: PluginType
  /** 占位符取值（按旧布局取：substitutionsOf(opts, oldLayout)），旧模板渲染比对用 */
  subs: Record<string, string>
  /** 重排前的根 manifest 包名。single → workspace 方向判断 bundle patch 身份是否
   *  变了（变了则不搬，旧行 id 会与新 manifest 对不上）；读不到（manifest 缺失 /
   *  损坏）同样不搬，保守为上。 */
  oldPackageName?: string
}

/** 搬完之后，检查落位的新仓里有没有「不属于新形态半边」的旧代码。full → host /
 *  client 最典型：用户的 src/client/、src/remote.ts 搬过来了，但新形态不构建、不
 *  装载它们。数据要保（不替用户删代码），但必须把话说破，并给出可执行的出路。 */
function deadHalfWarnings(dst: string, newType: PluginType): string[] {
  const hasFile = (p: string): boolean => {
    try { return statSync(join(dst, p)).isFile() } catch { return false }
  }
  const hasDir = (p: string): boolean => {
    try { return statSync(join(dst, p)).isDirectory() } catch { return false }
  }
  const dead: string[] = []
  if (newType !== 'full' && hasFile('src/remote.ts')) dead.push('src/remote.ts（值导入协议包，host / client 形态的 manifest 没有这个依赖，构建会直接红）')
  if (newType === 'host' && hasDir('src/client')) dead.push('src/client/（新形态不构建它）')
  if (newType === 'client' && hasFile('src/config.ts')) dead.push('src/config.ts（新形态不构建它）')
  const out: string[] = []
  if (dead.length > 0) {
    out.push(`新形态是 ${newType}，以下搬过来的旧代码不属于它的半边：${dead.join('；')}。请按 AGENTS.md 合并或删除。`)
  }
  // remote.ts 被判「未改动模板」清掉、但用户改过的 index.ts 还接着它（部分改动场景）：
  // 构建红在 missing module 上，用户不知道该补什么
  const indexPath = join(dst, 'src', 'index.ts')
  if (newType !== 'full' && existsSync(indexPath) && /from\s+['"]\.\/remote(\.ts)?['"]/.test(readFileSync(indexPath, 'utf8'))) {
    out.push('src/index.ts 还带着 Remote 接线（full 专属）：host / client 形态下 typert 产物与协议包依赖都不存在，构建会红。按 src/index.ts.template 合回模板版，或删掉 Remote 接线。')
  }
  return out
}

/**
 * 跨形态重排的目录清理：把旧布局里「用户改过的」内容搬到新布局的插件位置（未改动的
 * 模板文件直接清理，让新形态模板原位生效），删掉旧路径与旧布局的孤儿配置。同布局
 * （from === to）不搬不删，只靠渲染阶段的不覆盖规则保住用户内容。
 */
export function cleanupRearrangedLayout(dir: string, input: RearrangeInput, from: Layout, to: Layout): RearrangeResult {
  const result: RearrangeResult = { ran: false, from, to, moved: [], conflicts: [], removed: [], warnings: [] }
  if (from === to) return result

  if (from === 'single' && to === 'workspace') {
    const dst = join(dir, 'packages', input.pluginId)
    const all = collectUserFiles(dir)
    const oldType = inferOldType(all)
    const tmap = templateMapFor(oldType, input.pluginId, from)
    const files = all.filter((rel) => {
      const tpl = tmap.get(rel)
      return tpl === undefined || !rendersToSameContent(dir, rel, tpl, oldType, input.subs, from)
    })
    const moved = moveFiles(dir, dst, files)
    result.moved = moved.moved
    result.conflicts = moved.conflicts
    // 旧单包布局留在根的路径：内容面（已搬走或判定为未改动模板）+ 旧 tsdown.config.ts
    // （单配置，workspace 布局没有根级 tsdown 配置）+ 旧 lib/（构建产物，已过时）
    result.removed = removePaths(dir, ['src', 'tests', 'locale', 'icon.svg', 'tsdown.config.ts', 'lib'])
    // bundle patch 带插件行 id（随包名 / 插件 id）。只在能确认身份没变（旧根 manifest
    // 包名 = 新包名）时搬运；读不到旧包名或包名变了都不搬（旧行 id 与新 manifest 对
    // 不上，护栏会红），用新模板版并明说。
    const oldPatch = join(dir, 'cordis.patch.yml')
    if (existsSync(oldPatch)) {
      if (input.oldPackageName === input.packageName) {
        copyFileSync(oldPatch, join(dst, 'cordis.patch.yml'))
        result.moved.push('cordis.patch.yml')
        result.removed.push(...removePaths(dir, ['cordis.patch.yml']))
      } else {
        result.warnings.push(
          input.oldPackageName === undefined
            ? '根 manifest 包名读不出来，保守起见 cordis.patch.yml 未搬运（旧插件行 id 与新 manifest 可能对不上），已用新模板版本。'
            : `包名从 ${input.oldPackageName} 变成 ${input.packageName}，根目录的 cordis.patch.yml（插件行 id 随包名）未搬运，已用新模板版本。`,
          '你若在旧 patch 里加过自己的行，请从 git 历史找回并合入 packages/<id>/cordis.patch.yml。',
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
    // packages/ 里还有别的东西（插件包、杂散文件都算）就不清理：workspace → single 会
    // 把仓根变成插件包，留着多个包没有确定语义，删谁不能替用户决定
    const others = readdirSync(join(dir, 'packages'), { withFileTypes: true })
      .filter((e) => e.name !== input.pluginId && e.name !== 'protocol')
      .map((e) => e.name)
    if (others.length > 0) {
      result.warnings.push(
        `packages/ 里还有别的条目（${others.join(', ')}），未清理旧布局：workspace → single 会把仓根变成插件包，`
          + '留着多个插件包没有确定语义，要不要留由你决定',
      )
      return result
    }
    const all = collectUserFiles(src)
    const oldType = inferOldType(all)
    const tmap = templateMapFor(oldType, input.pluginId, from)
    const files = all.filter((rel) => {
      const tpl = tmap.get(rel)
      return tpl === undefined || !rendersToSameContent(src, rel, tpl, oldType, input.subs, from)
    })
    const moved = moveFiles(src, dir, files)
    result.moved = moved.moved
    result.conflicts = moved.conflicts
    // 插件身份在这个方向不变（packages/<id> 的包名 = 新根 = 新包名）：bundle patch
    // 照搬；根上刚渲染的模板版内容不同才备份（一致就直接覆盖，不算冲突）
    const pkgPatch = join(src, 'cordis.patch.yml')
    const rootPatch = join(dir, 'cordis.patch.yml')
    if (existsSync(pkgPatch)) {
      const pkgText = readFileSync(pkgPatch, 'utf8')
      if (existsSync(rootPatch) && readFileSync(rootPatch, 'utf8') !== pkgText) {
        copyFileSync(rootPatch, `${rootPatch}.template`)
        result.conflicts.push('cordis.patch.yml')
      }
      copyFileSync(pkgPatch, rootPatch)
      result.moved.push('cordis.patch.yml')
    }
    const pkgRemoved = removePaths(src, ['src', 'tests', 'locale', 'icon.svg', 'cordis.patch.yml', 'lib'])
      .map((r) => `packages/${input.pluginId}/${r}`)
    result.removed = pkgRemoved
    result.removed.push(...removePaths(dir, [`packages/${input.pluginId}`]))
    result.removed.push(...removePaths(dir, ['pnpm-workspace.yaml']))
    result.removed.push(...removePaths(dir, ['packages']))
    // 旧 workspace 布局的孤儿配置：single 布局不渲染它们，留着是死文件（tsconfig.host.json
    // 还会指向已被删掉的 packages/protocol）。dev-hmr 只有 host 形态用：client 单包没有
    // host 半边，旧 workspace 的 dev-hmr 是孤儿。
    result.removed.push(...removePaths(dir, ['tsconfig.host.json', 'scripts/sync-pack-docs.mjs', 'scripts/ensure-protocol.mjs']))
    if (input.newType === 'client') result.removed.push(...removePaths(dir, ['scripts/dev-hmr.mjs']))
    // 协议声明源 submodule 随 packages/ 一起删了：.gitmodules 若只登记了 protocol 一并清掉；
    // 还登记着别的 submodule 则保留并告警。git 索引里的 gitlink 不动（不替用户改 git 状态），
    // 给出清理命令。
    const gitmodulesPath = join(dir, '.gitmodules')
    if (existsSync(gitmodulesPath)) {
      const text = readFileSync(gitmodulesPath, 'utf8')
      const paths = [...text.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => m[1]?.trim() ?? '')
      if (paths.length > 0 && paths.every((p) => p === 'packages/protocol')) {
        rmSync(gitmodulesPath)
        result.removed.push('.gitmodules')
      } else {
        result.warnings.push('.gitmodules 里还有别的 submodule，未删除；packages/protocol 的登记需手工清（git rm 会一并处理）')
      }
      if (existsSync(join(dir, '.git'))) {
        result.warnings.push(
          'packages/protocol 是 git submodule，目录已随 packages/ 删除。git 登记需手工清：'
            + 'git rm -r --cached packages/protocol（或下次提交时一并删除）；.git/modules 下的克隆可留可删。',
        )
      }
    }
    result.warnings.push(...deadHalfWarnings(dir, input.newType))
    result.ran = true
    return result
  }

  return result
}
