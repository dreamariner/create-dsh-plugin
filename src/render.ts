// create-dsh-plugin :: 模板渲染（计划 → 拷贝 + 占位符替换）
//
// 三形态统一 workspace 布局（根壳 + packages/<id>/ 插件包）：默认一个插件，
// add 子命令可继续追加任意多个插件，仓结构无需迁移。
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
import { buildManifests, buildPackageManifest } from './manifest.ts'
import type { PluginType, RenderFile, ScaffoldOptions } from './types.ts'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

/** 模板占位符 → 生成值。 */
export function substitutionsOf(opts: ScaffoldOptions): Record<string, string> {
  return {
    __PROJECT_NAME__: opts.projectName ?? opts.pluginId,
    __PACKAGE_NAME__: opts.packageName,
    __PLUGIN_ID__: opts.pluginId,
    __TITLE__: opts.title,
    __DESCRIPTION__: opts.description,
    __PASCAL_NAME__: pascalOf(opts.packageName),
    __SERVICE_KEY__: camelOf(opts.packageName),
    __PLUGIN_TYPE_LABEL__: opts.type === 'host' ? '纯 Node 半边' : opts.type === 'client' ? '纯浏览器半边' : 'host + client 双端',
    // 插件包相对仓根的目录（三形态统一 workspace 布局）
    __PLUGIN_REL__: `packages/${opts.pluginId}`,
  }
}

/** 仓根壳文件（三形态共用；full 额外带 typert 聚合配置）。 */
export function buildRootPlan(type: PluginType): RenderFile[] {
  const root: RenderFile[] = [
    { from: 'common/gitignore.tpl', to: '.gitignore' },
    { from: 'common/README.md.tpl', to: 'README.md' },
    { from: 'common/LICENSE', to: 'LICENSE' },
    { from: 'common/pnpm-workspace.yaml.tpl', to: 'pnpm-workspace.yaml' },
    { from: 'tsconfig/root.json.tpl', to: 'tsconfig.json' },
    { from: 'common/vitest.root.config.ts.tpl', to: 'vitest.config.ts' },
  ]
  if (type === 'full') {
    root.push({ from: 'full/tsconfig.host.json.tpl', to: 'tsconfig.host.json' })
  }
  return root
}

/** 单个插件包的文件清单（dest 相对仓根）。add 子命令只跑本计划 + 根接线。 */
export function buildPluginPlan(type: PluginType, pluginId: string): RenderFile[] {
  const p = `packages/${pluginId}`
  const common: RenderFile[] = [
    { from: 'common/cordis.patch.yml.tpl', to: `${p}/cordis.patch.yml` },
    { from: 'common/locale/en.json.tpl', to: `${p}/locale/en.json` },
    { from: 'common/locale/zh.json.tpl', to: `${p}/locale/zh.json` },
    { from: 'common/icon.svg.tpl', to: `${p}/icon.svg` },
    { from: 'common/tests/setup.ts.tpl', to: `${p}/tests/setup.ts` },
    { from: 'tsconfig/plugin.json.tpl', to: `${p}/tsconfig.json` },
  ]
  const hostHalf: RenderFile[] = [
    { from: 'host/src/config.ts.tpl', to: `${p}/src/config.ts` },
    { from: 'host/scripts/dev-hmr.mjs.tpl', to: `${p}/scripts/dev-hmr.mjs` },
    { from: 'host/scripts/lib/manifest-deps.mjs', to: `${p}/scripts/lib/manifest-deps.mjs` },
  ]
  const hostIndex: RenderFile = { from: 'host/src/index.ts.tpl', to: `${p}/src/index.ts` }
  const clientShim: RenderFile = { from: 'client-shim/src/index.ts.tpl', to: `${p}/src/index.ts` }
  const clientHalf: RenderFile[] = [
    { from: 'client/src/client/index.tsx.tpl', to: `${p}/src/client/index.tsx` },
    { from: 'client/tests/client-boundary.spec.ts.tpl', to: `${p}/tests/client-boundary.spec.ts` },
  ]
  const tsdown: RenderFile = type === 'host'
    ? { from: 'tsdown/host.ts.tpl', to: `${p}/tsdown.config.ts` }
    : type === 'client'
      ? { from: 'tsdown/client.ts.tpl', to: `${p}/tsdown.config.ts` }
      : { from: 'tsdown/full.ts.tpl', to: `${p}/tsdown.config.ts` }
  // bundle 形态守卫：host 用纯 host 变体；client / full 多一条 dsh.client 断言
  const bundleShape: RenderFile = type === 'host'
    ? { from: 'host/tests/bundle-shape.spec.ts.tpl', to: `${p}/tests/bundle-shape.spec.ts` }
    : { from: 'client/tests/bundle-shape.spec.ts.tpl', to: `${p}/tests/bundle-shape.spec.ts` }
  // full 专属：typert 接线（face 配置 / wire 契约 / 协议守卫 / preinstall 硬守卫）
  const typert: RenderFile[] = type === 'full'
    ? [
        { from: 'full/tsconfig.typert.json.tpl', to: `${p}/tsconfig.typert.json` },
        { from: 'full/src/remote.ts.tpl', to: `${p}/src/remote.ts` },
        { from: 'full/src/index.ts.tpl', to: `${p}/src/index.ts` },
        { from: 'full/scripts/ensure-protocol.mjs.tpl', to: `${p}/scripts/ensure-protocol.mjs` },
        { from: 'full/tests/protocol-vendor.spec.ts.tpl', to: `${p}/tests/protocol-vendor.spec.ts` },
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

/** 组合计划（新建仓用：根壳 + 默认插件）。 */
export function buildPlan(type: PluginType, pluginId = ''): RenderFile[] {
  return [...buildRootPlan(type), ...buildPluginPlan(type, pluginId)]
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
  return text.replace(/__(?:PROJECT_NAME|PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|SERVICE_KEY|PLUGIN_REL|PLUGIN_TYPE_LABEL)__/g, (m) => sub[m] ?? m)
}

/** 渲染整个项目（新建仓）：两份 manifest + 根壳 + 默认插件。返回写入的文件数。 */
export function renderProject(opts: ScaffoldOptions): number {
  const { targetDir } = opts
  mkdirSync(targetDir, { recursive: true })

  const manifests = buildManifests(opts)
  writeFileSync(join(targetDir, 'package.json'), `${JSON.stringify(manifests.root, null, 2)}\n`)
  writePluginManifest(opts, manifests.plugin)

  let count = 2
  count += renderFiles(opts, buildPlan(opts.type, opts.pluginId), targetDir)
  return count
}

/** 渲染单个插件包（add 模式）：插件 manifest + 插件文件清单，写进既有 workspace 仓根。 */
export function renderPluginPackage(opts: ScaffoldOptions): number {
  writePluginManifest(opts, buildPackageManifest(opts))
  return 1 + renderFiles(opts, buildPluginPlan(opts.type, opts.pluginId), opts.targetDir)
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
