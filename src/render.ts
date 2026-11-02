// create-dsh-plugin :: 模板渲染（计划 → 拷贝 + 占位符替换）
//
// 布局按形态走（layoutOf）：full → workspace（typert 硬约束 + 协议 submodule 需要
// 仓库级挂载点）；host / client → single（根 = 插件包，npm / git / CLI 安装一步到位）。
// add（向既有 workspace 仓追加插件）只有 workspace 仓支持；单包仓跨形态升级用
// create --dir 重排（profile 旧装法自动迁移）。
// 模板矩阵（templates/ 下）：
//   common/       全形态共用（patch / 测试基建 / 展示元数据 / README / LICENSE /
//                 workspace 声明 / 根 vitest）
//   tsconfig/     root.json（workspace 根）+ plugin.json（插件包 extends 根）
//   tsdown/       host 单配置 / client 单配置 / full 数组双配置
//   host/         host 半边（tool demo + Config + deps 三件套 + hmr）:host 与 full 共用
//   client-shim/  纯 client 插件的宿主壳（空 apply，官方 decoration 形态）
//   client/       client 半边（TSX 入口 + 边界护栏 + client 形态守卫）:client 与 full 共用
//   full/         full 专属（tsconfig.host.json + tsconfig.typert.json + remote.ts +
//                 ensure-protocol + 消费端守卫）
//
// 占位符用 __X__ 双下划线形式：与 TS / YAML / Markdown 的合法语法零交集，替换是
// 纯字符串全量 replace，无残留即渲染完成。

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { camelOf, pascalOf } from './args.ts'
import { buildManifests, buildPackageManifest, layoutOf } from './manifest.ts'
import type { PluginType, RenderFile, ScaffoldOptions } from './types.ts'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

/** 模板占位符 → 生成值。layout 感知：single 布局插件包就在根（'.'），manifest-deps
 *  引用路径也随布局变（workspace 插件包住 packages/<id>/，要 ../../）。 */
export function substitutionsOf(opts: ScaffoldOptions): Record<string, string> {
  const single = layoutOf(opts.type) === 'single'
  return {
    __PROJECT_NAME__: opts.projectName ?? opts.pluginId,
    __PACKAGE_NAME__: opts.packageName,
    __PLUGIN_ID__: opts.pluginId,
    __TITLE__: opts.title,
    __DESCRIPTION__: opts.description,
    __PASCAL_NAME__: pascalOf(opts.packageName),
    __SERVICE_KEY__: camelOf(opts.packageName),
    __PLUGIN_TYPE_LABEL__: opts.type === 'host' ? '纯 Node 半边' : opts.type === 'client' ? '纯浏览器半边' : 'host + client 双端',
    // 插件包相对仓根的目录（single = 根本身）
    __PLUGIN_REL__: single ? '.' : `packages/${opts.pluginId}`,
    // tsdown 配置引用根 scripts/lib/manifest-deps.mjs 的相对路径
    __MANIFEST_DEPS_REL__: single ? './scripts/lib/manifest-deps.mjs' : '../../scripts/lib/manifest-deps.mjs',
    // profile-add 用：本包相对仓根的 link 后缀（single = 根本身）
    __SELF_LINK_SUFFIX__: single ? '' : `/packages/${opts.pluginId}`,
    __PACKAGE_MANAGER__: 'pnpm@11.7.0',
  }
}

/** 仓库根文件。workspace（full）：根壳 + 项目共用脚本；single（host / client）：
 *  根即插件包，只要单包版的 gitignore / README / vitest 与 manifest-deps。 */
export function buildRootPlan(type: PluginType): RenderFile[] {
  if (layoutOf(type) === 'single') {
    const root: RenderFile[] = [
      { from: 'common/gitignore.single.tpl', to: '.gitignore' },
      { from: 'common/README.single.md.tpl', to: 'README.md' },
      { from: 'common/LICENSE', to: 'LICENSE' },
      { from: 'common/vitest.single.config.ts.tpl', to: 'vitest.config.ts' },
      { from: 'common/scripts/lib/manifest-deps.mjs', to: 'scripts/lib/manifest-deps.mjs' },
      { from: 'common/scripts/profile-add.mjs.tpl', to: 'scripts/profile-add.mjs' },
    ]
    if (type === 'host') root.push({ from: 'common/scripts/dev-hmr.mjs.tpl', to: 'scripts/dev-hmr.mjs' })
    return root
  }
  const root: RenderFile[] = [
    { from: 'common/gitignore.tpl', to: '.gitignore' },
    { from: 'common/README.md.tpl', to: 'README.md' },
    { from: 'common/LICENSE', to: 'LICENSE' },
    { from: 'common/pnpm-workspace.yaml.tpl', to: 'pnpm-workspace.yaml' },
    { from: 'tsconfig/root.json.tpl', to: 'tsconfig.json' },
    { from: 'common/vitest.root.config.ts.tpl', to: 'vitest.config.ts' },
    // 项目共用脚本（单一拷贝；插件包的 tsdown 配置经 ../../ 引用 manifest-deps）
    { from: 'common/scripts/lib/manifest-deps.mjs', to: 'scripts/lib/manifest-deps.mjs' },
    { from: 'common/scripts/sync-pack-docs.mjs', to: 'scripts/sync-pack-docs.mjs' },
    { from: 'common/scripts/profile-add.mjs.tpl', to: 'scripts/profile-add.mjs' },
  ]
  root.push({ from: 'common/scripts/dev-hmr.mjs.tpl', to: 'scripts/dev-hmr.mjs' })
  root.push({ from: 'full/tsconfig.host.json.tpl', to: 'tsconfig.host.json' })
  root.push({ from: 'full/scripts/ensure-protocol.mjs.tpl', to: 'scripts/ensure-protocol.mjs' })
  return root
}

/** 插件包文件清单（dest 相对仓根）。add 子命令只跑本计划 + 根接线（workspace 仓）。
 *  single 布局同样的清单落在根（p = '.'），tsconfig 用独立版（无根可 extends）。 */
export function buildPluginPlan(type: PluginType, pluginId: string, layout: 'workspace' | 'single' = 'workspace'): RenderFile[] {
  // ⚠ layout 必须显式可传：add 往 workspace 仓追加 host / client 插件时，包要落
  // packages/<id>/（workspace 语义），不能按插件形态推导。
  const single = layout === 'single'
  const p = single ? '' : `packages/${pluginId}`
  const at = (f: string): string => (p ? `${p}/${f}` : f)
  const common: RenderFile[] = [
    { from: 'common/cordis.patch.yml.tpl', to: at('cordis.patch.yml') },
    { from: 'common/locale/en.json.tpl', to: at('locale/en.json') },
    { from: 'common/locale/zh.json.tpl', to: at('locale/zh.json') },
    { from: 'common/icon.svg.tpl', to: at('icon.svg') },
    { from: 'common/tests/setup.ts.tpl', to: at('tests/setup.ts') },
    single
      ? { from: 'tsconfig/single.json.tpl', to: 'tsconfig.json' }
      : { from: 'tsconfig/plugin.json.tpl', to: at('tsconfig.json') },
  ]
  const hostHalf: RenderFile[] = [
    { from: 'host/src/config.ts.tpl', to: at('src/config.ts') },
  ]
  const hostIndex: RenderFile = { from: 'host/src/index.ts.tpl', to: at('src/index.ts') }
  const clientShim: RenderFile = { from: 'client-shim/src/index.ts.tpl', to: at('src/index.ts') }
  const clientHalf: RenderFile[] = [
    { from: 'client/src/client/index.tsx.tpl', to: at('src/client/index.tsx') },
    { from: 'client/tests/client-boundary.spec.ts.tpl', to: at('tests/client-boundary.spec.ts') },
  ]
  const tsdown: RenderFile = type === 'host'
    ? { from: 'tsdown/host.ts.tpl', to: at('tsdown.config.ts') }
    : type === 'client'
      ? { from: 'tsdown/client.ts.tpl', to: at('tsdown.config.ts') }
      : { from: 'tsdown/full.ts.tpl', to: at('tsdown.config.ts') }
  // bundle 形态守卫：host 用纯 host 变体；client / full 多一条 dsh.client 断言
  const bundleShape: RenderFile = type === 'host'
    ? { from: 'host/tests/bundle-shape.spec.ts.tpl', to: at('tests/bundle-shape.spec.ts') }
    : { from: 'client/tests/bundle-shape.spec.ts.tpl', to: at('tests/bundle-shape.spec.ts') }
  // full 专属：typert 接线（face 配置 / wire 契约 / 协议守卫；守卫脚本住根 scripts/）
  const typert: RenderFile[] = type === 'full'
    ? [
        { from: 'full/tsconfig.typert.json.tpl', to: at('tsconfig.typert.json') },
        { from: 'full/src/remote.ts.tpl', to: at('src/remote.ts') },
        { from: 'full/src/index.ts.tpl', to: at('src/index.ts') },
        { from: 'full/tests/protocol-vendor.spec.ts.tpl', to: at('tests/protocol-vendor.spec.ts') },
        { from: 'full/tests/typert-face-install.spec.ts.tpl', to: at('tests/typert-face-install.spec.ts') },
      ]
    : []

  switch (type) {
    case 'host':
      return [...common, ...hostHalf, hostIndex, tsdown, bundleShape]
    case 'client':
      return [...common, clientShim, ...clientHalf, tsdown, bundleShape]
    case 'full':
      return [...common, ...hostHalf, ...typert, ...clientHalf, tsdown, bundleShape]
  }
}

/** 组合计划（新建仓用）：workspace = 根壳 + 默认插件；single = 根即插件包。 */
export function buildPlan(type: PluginType, pluginId = ''): RenderFile[] {
  return [...buildRootPlan(type), ...buildPluginPlan(type, pluginId, layoutOf(type))]
}

/** 条件块：<!--#if host-->…<!--#endif-->（条件可为 host|client|full 的「|」并列）。
 *  用在 README 这类多类型共用、但按类型有专属小节的模板里。 */
export function applyConditionalBlocks(text: string, type: PluginType): string {
  return text.replace(/<!--#if ([a-z|]+)-->\n?([\s\S]*?)<!--#endif-->\n?/g, (_m, cond: string, body: string) => {
    return ((cond as string).split('|') as PluginType[]).includes(type) ? body : ''
  })
}

/** 对单份模板文本做条件块与占位符替换。 */
export function renderTemplateText(src: string, type: PluginType, sub: Record<string, string>): string {
  const text = applyConditionalBlocks(readFileSync(src, 'utf8'), type)
  return text.replace(/__(?:PROJECT_NAME|PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|SERVICE_KEY|PLUGIN_REL|PLUGIN_TYPE_LABEL|MANIFEST_DEPS_REL|SELF_LINK_SUFFIX|PACKAGE_MANAGER)__/g, (m) => sub[m] ?? m)
}

/** 渲染整个项目（新建仓）：workspace 写两份 manifest；single 根 package.json 就是
 *  插件 manifest。返回写入的文件数。 */
export function renderProject(opts: ScaffoldOptions): number {
  const { targetDir } = opts
  mkdirSync(targetDir, { recursive: true })

  const manifests = buildManifests(opts)
  writeFileSync(join(targetDir, 'package.json'), `${JSON.stringify(manifests.root, null, 2)}\n`)
  let count = 1
  if (manifests.plugin !== null) {
    writePluginManifest(opts, manifests.plugin)
    count++
  }
  count += renderFiles(opts, buildPlan(opts.type, opts.pluginId), targetDir)
  return count
}

/** 渲染单个插件包（add 模式）：插件 manifest + 插件文件清单，写进既有 workspace 仓根。 */
export function renderPluginPackage(opts: ScaffoldOptions): number {
  writePluginManifest(opts, buildPackageManifest(opts))
  return 1 + renderFiles(opts, buildPluginPlan(opts.type, opts.pluginId, 'workspace'), opts.targetDir)
}

function writePluginManifest(opts: ScaffoldOptions, manifest: Record<string, unknown>): void {
  const dir = join(opts.targetDir, 'packages', opts.pluginId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

/** 渲染一组计划文件到 rootDir 下（.tpl 做替换，非 .tpl 原样拷贝）。返回写入数。 */
function renderFiles(opts: ScaffoldOptions, plan: RenderFile[], rootDir: string): number {
  const sub = substitutionsOf(opts)
  let count = 0
  for (const file of plan) {
    const src = join(TEMPLATES, file.from)
    if (!existsSync(src)) throw new Error(`模板缺失：${file.from}（安装不完整？）`)
    const dest = join(rootDir, file.to)
    mkdirSync(dirname(dest), { recursive: true })
    if (file.from.endsWith('.tpl')) {
      writeFileSync(dest, renderTemplateText(src, opts.type, sub))
    } else {
      // 非 .tpl 文件原样拷贝（如 manifest-deps.mjs 这类零占位符的通用模块）
      cpSync(src, dest)
    }
    count++
  }
  return count
}
