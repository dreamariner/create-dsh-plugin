// create-dsh-plugin :: 模板渲染（计划 → 拷贝 + 占位符替换）
//
// 模板矩阵（templates/ 下）：
//   common/       三类型共用（patch / 测试基建 / 展示元数据 / README / LICENSE / gitignore）
//   host/         host 半边（tool demo + Config + deps 三件套 + hmr）——host 与 full 共用
//   client-shim/  纯 client 类型的宿主壳（空 apply，官方 decoration 形态）
//   client/       client 半边（TSX 入口 + 边界护栏 + client 形态守卫）——client 与 full 共用
//   tsdown/       构建配置三变体（host 单配置 / client 单配置 / full 数组双配置）
//   tsconfig/     tsconfig 两变体（host 无 jsx / client 与 full 带 jsx）
//
// 占位符用 __X__ 双下划线形式：与 TS / YAML / Markdown 的合法语法零交集，替换是
// 纯字符串全量 replace，无残留即渲染完成。

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { camelOf, pascalOf } from './args.ts'
import { buildManifests } from './manifest.ts'
import type { PluginType, RenderFile, ScaffoldOptions } from './types.ts'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

/** 模板占位符 → 生成值。 */
export function substitutionsOf(opts: ScaffoldOptions): Record<string, string> {
  return {
    __PACKAGE_NAME__: opts.packageName,
    __PLUGIN_ID__: opts.pluginId,
    __TITLE__: opts.title,
    __DESCRIPTION__: opts.description,
    __PASCAL_NAME__: pascalOf(opts.packageName),
    __SERVICE_KEY__: camelOf(opts.packageName),
    __PLUGIN_TYPE_LABEL__: opts.type === 'host' ? '纯 Node 半边' : opts.type === 'client' ? '纯浏览器半边' : 'host + client 双端',
    // full 布局：插件包相对仓根的目录（host/client 单包布局 = ''，join(ROOT, '', x) 仍指向根）
    __PLUGIN_REL__: opts.type === 'full' ? `packages/${opts.pluginId}` : '',
    __TEST_INCLUDE__: opts.type === 'full' ? 'packages/*/tests/**/*.spec.ts' : 'tests/**/*.spec.ts',
    __TEST_SETUP__: opts.type === 'full' ? `packages/${opts.pluginId}/tests/setup.ts` : './tests/setup.ts',
  }
}

/** 按类型算出渲染计划（package.json 由 manifest 层单独写，不在 plan 里）。
 *  full 布局需要 pluginId 拼 packages/<id>/ 前缀；host/client 单包布局用不到。 */
export function buildPlan(type: PluginType, pluginId = ''): RenderFile[] {
  if (type === 'full') return buildFullPlan(pluginId)
  return buildSinglePackagePlan(type)
}

/** full 布局（workspace：根壳 + packages/<id>/ 插件包 + packages/protocol submodule）。 */
function buildFullPlan(pluginId: string): RenderFile[] {
  const p = `packages/${pluginId}`
  const common: RenderFile[] = [
    { from: 'common/gitignore.tpl', to: '.gitignore' },
    { from: 'common/README.md.tpl', to: 'README.md' },
    { from: 'common/LICENSE', to: 'LICENSE' },
  ]
  const root: RenderFile[] = [
    { from: 'full/pnpm-workspace.yaml.tpl', to: 'pnpm-workspace.yaml' },
    { from: 'full/tsconfig.root.json.tpl', to: 'tsconfig.json' },
    { from: 'full/tsconfig.host.json.tpl', to: 'tsconfig.host.json' },
    { from: 'full/vitest.config.ts.tpl', to: 'vitest.config.ts' },
  ]
  const plugin: RenderFile[] = [
    { from: 'tsconfig/plugin.json.tpl', to: `${p}/tsconfig.json` },
    { from: 'full/tsconfig.typert.json.tpl', to: `${p}/tsconfig.typert.json` },
    { from: 'tsdown/full.ts.tpl', to: `${p}/tsdown.config.ts` },
    { from: 'common/cordis.patch.yml.tpl', to: `${p}/cordis.patch.yml` },
    { from: 'common/locale/en.json.tpl', to: `${p}/locale/en.json` },
    { from: 'common/locale/zh.json.tpl', to: `${p}/locale/zh.json` },
    { from: 'common/icon.svg.tpl', to: `${p}/icon.svg` },
    { from: 'common/tests/setup.ts.tpl', to: `${p}/tests/setup.ts` },
    { from: 'full/src/remote.ts.tpl', to: `${p}/src/remote.ts` },
    { from: 'full/src/index.ts.tpl', to: `${p}/src/index.ts` },
    { from: 'host/src/config.ts.tpl', to: `${p}/src/config.ts` },
    { from: 'client/src/client/index.tsx.tpl', to: `${p}/src/client/index.tsx` },
    { from: 'host/scripts/dev-hmr.mjs.tpl', to: `${p}/scripts/dev-hmr.mjs` },
    { from: 'full/scripts/ensure-protocol.mjs.tpl', to: `${p}/scripts/ensure-protocol.mjs` },
    { from: 'host/scripts/lib/manifest-deps.mjs', to: `${p}/scripts/lib/manifest-deps.mjs` },
    { from: 'client/tests/bundle-shape.spec.ts.tpl', to: `${p}/tests/bundle-shape.spec.ts` },
    { from: 'client/tests/client-boundary.spec.ts.tpl', to: `${p}/tests/client-boundary.spec.ts` },
    { from: 'full/tests/protocol-vendor.spec.ts.tpl', to: `${p}/tests/protocol-vendor.spec.ts` },
  ]
  return [...common, ...root, ...plugin]
}

/** 单包布局（host / client：根就是插件包）。 */
function buildSinglePackagePlan(type: 'host' | 'client'): RenderFile[] {
  const common: RenderFile[] = [
    { from: 'common/gitignore.tpl', to: '.gitignore' },
    { from: 'common/README.md.tpl', to: 'README.md' },
    { from: 'common/vitest.config.ts.tpl', to: 'vitest.config.ts' },
    { from: 'common/cordis.patch.yml.tpl', to: 'cordis.patch.yml' },
    { from: 'common/tests/setup.ts.tpl', to: 'tests/setup.ts' },
    { from: 'common/locale/en.json.tpl', to: 'locale/en.json' },
    { from: 'common/locale/zh.json.tpl', to: 'locale/zh.json' },
    { from: 'common/icon.svg.tpl', to: 'icon.svg' },
    { from: 'common/LICENSE', to: 'LICENSE' },
  ]
  const hostHalf: RenderFile[] = [
    { from: 'host/src/config.ts.tpl', to: 'src/config.ts' },
    { from: 'host/scripts/dev-hmr.mjs.tpl', to: 'scripts/dev-hmr.mjs' },
    { from: 'host/scripts/lib/manifest-deps.mjs', to: 'scripts/lib/manifest-deps.mjs' },
  ]
  const hostIndex: RenderFile = { from: 'host/src/index.ts.tpl', to: 'src/index.ts' }
  const clientShim: RenderFile[] = [
    { from: 'client-shim/src/index.ts.tpl', to: 'src/index.ts' },
  ]
  const clientHalf: RenderFile[] = [
    { from: 'client/src/client/index.tsx.tpl', to: 'src/client/index.tsx' },
    { from: 'client/tests/client-boundary.spec.ts.tpl', to: 'tests/client-boundary.spec.ts' },
  ]
  const tsconfig: RenderFile = type === 'host'
    ? { from: 'tsconfig/host.json.tpl', to: 'tsconfig.json' }
    : { from: 'tsconfig/client.json.tpl', to: 'tsconfig.json' }
  const tsdown: RenderFile = type === 'host'
    ? { from: 'tsdown/host.ts.tpl', to: 'tsdown.config.ts' }
    : { from: 'tsdown/client.ts.tpl', to: 'tsdown.config.ts' }
  const bundleShape: RenderFile = type === 'host'
    ? { from: 'host/tests/bundle-shape.spec.ts.tpl', to: 'tests/bundle-shape.spec.ts' }
    : { from: 'client/tests/bundle-shape.spec.ts.tpl', to: 'tests/bundle-shape.spec.ts' }

  if (type === 'host') {
    return [tsconfig, tsdown, ...common, ...hostHalf, hostIndex, bundleShape]
  }
  return [tsconfig, tsdown, ...common, ...clientShim, ...clientHalf, bundleShape]
}

/** 条件块：<!--#if host-->…<!--#endif-->（条件可为 host|client|full 的「|」并列）。
 *  用在 README 这类多类型共用、但按类型有专属小节的模板里。 */
export function applyConditionalBlocks(text: string, type: PluginType): string {
  return text.replace(/<!--#if ([a-z|]+)-->\n?([\s\S]*?)<!--#endif-->\n?/g, (_m, cond: string, body: string) => {
    return ((cond as string).split('|') as PluginType[]).includes(type) ? body : ''
  })
}

/** 渲染整个项目：写 package.json（单包一份 / full 两份）+ 跑计划。返回写入的文件数。 */
export function renderProject(opts: ScaffoldOptions): number {
  const { targetDir } = opts
  mkdirSync(targetDir, { recursive: true })

  const manifests = buildManifests(opts)
  writeFileSync(join(targetDir, 'package.json'), `${JSON.stringify(manifests.root ?? manifests.plugin, null, 2)}\n`)
  let count = 1
  if (manifests.root !== undefined) {
    // full 布局：根壳 + packages/<id>/package.json（插件包）
    const pluginManifestPath = join(targetDir, `packages/${opts.pluginId}`, 'package.json')
    mkdirSync(dirname(pluginManifestPath), { recursive: true })
    writeFileSync(pluginManifestPath, `${JSON.stringify(manifests.plugin, null, 2)}\n`)
    count += 1
  }

  const sub = substitutionsOf(opts)
  for (const file of buildPlan(opts.type, opts.pluginId)) {
    const src = join(TEMPLATES, file.from)
    if (!existsSync(src)) throw new Error(`模板缺失：${file.from}（安装不完整？）`)
    const dest = join(targetDir, file.to)
    mkdirSync(dirname(dest), { recursive: true })
    if (file.from.endsWith('.tpl')) {
      const text = applyConditionalBlocks(readFileSync(src, 'utf8'), opts.type)
      writeFileSync(dest, text.replace(/__(?:PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|SERVICE_KEY|PLUGIN_TYPE_LABEL|PLUGIN_REL|TEST_INCLUDE|TEST_SETUP)__/g, (m) => sub[m] ?? m))
    } else {
      // 非 .tpl 文件原样拷贝（如 manifest-deps.mjs 这类零占位符的通用模块）
      cpSync(src, dest)
    }
    count++
  }
  return count
}
