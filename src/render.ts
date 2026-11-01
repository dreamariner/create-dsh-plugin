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
import { pascalOf } from './args.ts'
import { buildManifest } from './manifest.ts'
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
    __PLUGIN_TYPE_LABEL__: opts.type === 'host' ? '纯 Node 半边' : opts.type === 'client' ? '纯浏览器半边' : 'host + client 双端',
  }
}

/** 按类型算出渲染计划（文件清单，不含 package.json——它由 manifest.ts 程序化构造）。 */
export function buildPlan(type: PluginType): RenderFile[] {
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
  // host 半边（不含 bundle-shape 守卫：它按类型有两个变体）
  const hostHalf: RenderFile[] = [
    { from: 'host/src/index.ts.tpl', to: 'src/index.ts' },
    { from: 'host/src/config.ts.tpl', to: 'src/config.ts' },
    { from: 'host/scripts/dev-hmr.mjs.tpl', to: 'scripts/dev-hmr.mjs' },
    { from: 'host/scripts/lib/manifest-deps.mjs', to: 'scripts/lib/manifest-deps.mjs' },
  ]
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
    : type === 'client'
      ? { from: 'tsdown/client.ts.tpl', to: 'tsdown.config.ts' }
      : { from: 'tsdown/full.ts.tpl', to: 'tsdown.config.ts' }
  // bundle 形态守卫：host 类型用纯 host 变体；client / full 多一条 dsh.client 断言
  const bundleShape: RenderFile = type === 'host'
    ? { from: 'host/tests/bundle-shape.spec.ts.tpl', to: 'tests/bundle-shape.spec.ts' }
    : { from: 'client/tests/bundle-shape.spec.ts.tpl', to: 'tests/bundle-shape.spec.ts' }

  switch (type) {
    case 'host':
      return [tsconfig, tsdown, ...common, ...hostHalf, bundleShape]
    case 'client':
      return [tsconfig, tsdown, ...common, ...clientShim, ...clientHalf, bundleShape]
    case 'full':
      return [tsconfig, tsdown, ...common, ...hostHalf, ...clientHalf, bundleShape]
  }
}

/** 渲染整个项目：写 package.json + 跑计划。返回写入的文件数（含 package.json）。 */
export function renderProject(opts: ScaffoldOptions): number {
  const { targetDir } = opts
  mkdirSync(targetDir, { recursive: true })
  writeFileSync(join(targetDir, 'package.json'), `${JSON.stringify(buildManifest(opts), null, 2)}\n`)

  const sub = substitutionsOf(opts)
  let count = 1
  for (const file of buildPlan(opts.type)) {
    const src = join(TEMPLATES, file.from)
    if (!existsSync(src)) throw new Error(`模板缺失：${file.from}（安装不完整？）`)
    const dest = join(targetDir, file.to)
    mkdirSync(dirname(dest), { recursive: true })
    if (file.from.endsWith('.tpl')) {
      writeFileSync(dest, readFileSync(src, 'utf8').replace(/__(?:PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|PLUGIN_TYPE_LABEL)__/g, (m) => sub[m] ?? m))
    } else {
      // 非 .tpl 文件原样拷贝（如 manifest-deps.mjs 这类零占位符的通用模块）
      cpSync(src, dest)
    }
    count++
  }
  return count
}
