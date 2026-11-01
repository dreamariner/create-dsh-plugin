// create-dsh-plugin :: 生成项目 package.json 的程序化构造
//
// 为什么不用文本模板：package.json 的字段按类型差异大（exports / dsh.client /
// peerDependencies / devDependencies），程序化构造 + JSON.stringify 保证格式合法、
// 字段顺序稳定。数值与形态全部来自实测可运行的参照：
//   · host 形态照 @dreamariner/dsh-web-search-minimax（npm 可发布、git 可安装）；
//   · client / full 的 client 声明照 DSH 官方 decoration 模板（platform / immediately /
//     inject / external 四字段），双端构建形态取自同代外部插件仓的实战沉淀。

import type { PluginType } from './types.ts'

/** DSH 版本锚：与官方打包版 rc.3 对齐（升级时改这里 + tsconfig/模板注释里的版本）。 */
export const DSH_VERSION = '0.2.1-rc.3'

/** schemastery（配置校验）的宿主共享版本：peer 范围 + dev 精确钉（不变式 I1）。 */
const SCHEMASTERY = { peer: '>=3.18.5 <4.0.0-0', dev: '3.18.5' } as const

/** @deepseek-ai/cordis（Context 类型来源）：dev 精确钉（类型源）。 */
const CORDIS_DEV = '4.0.5'

export interface ManifestInput {
  packageName: string
  pluginId: string
  description: string
  type: PluginType
}

/**
 * full 形态是 workspace 布局（根壳 + packages/<id>/ 插件包），因为 typert 生成器
 * 结构性要求「被分析的包位于 <root>/packages/ 下」（loadRegistrations 的 isWithin
 * 检查，tsdown 插件路径 includeVendor 恒 false）——单包布局里插件包不在 packages/
 * 下，生成器静默发现不了它。protocol 与插件包都必须住 packages/。
 * host / client 形态无生成器参与，保持单包布局（更简单）。
 */
export function buildManifests(input: ManifestInput): { root?: Record<string, unknown>; plugin: Record<string, unknown> } {
  if (input.type !== 'full') {
    return { plugin: buildPackageManifest(input) }
  }
  return {
    root: buildRootManifest(input),
    plugin: buildPackageManifest(input),
  }
}

/** full 形态的 workspace 根壳：private 壳，scripts 转发到插件包，测试与类型检查在根。 */
function buildRootManifest(input: ManifestInput): Record<string, unknown> {
  const { packageName, type } = input
  return {
    name: `${packageName}-workspace`,
    private: true,
    version: '0.1.0',
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    scripts: {
      build: `pnpm --filter ${packageName} build`,
      dev: `pnpm --filter ${packageName} dev`,
      ...(type === 'full' ? { 'dev:hmr': `pnpm --filter ${packageName} dev:hmr` } : {}),
      // git 安装（dsh plugin add git+url 拉 repo 根）时由 prepare 驱动子包构建
      prepare: `pnpm --filter ${packageName} build`,
      test: 'vitest run',
      'test:watch': 'vitest',
      typecheck: 'tsc --noEmit -p tsconfig.json',
    },
    devDependencies: {
      '@types/node': '^24',
      typescript: '^5.9',
      vitest: '^5.0.3',
    },
  }
}

/** 插件包 manifest（host / client 单包布局 = 根；full 布局 = packages/<id>/）。 */
export function buildPackageManifest(input: ManifestInput): Record<string, unknown> {
  const { type, packageName, pluginId, description } = input

  const hasClient = type === 'client' || type === 'full'
  const hasHost = type === 'host' || type === 'full'
  const hasTypert = type === 'full'

  const exports: Record<string, unknown> = {
    '.': './lib/index.js',
    ...(hasClient ? { './client': './lib/client.js' } : {}),
    './src/*': './src/*',
    './package.json': './package.json',
  }
  if (hasTypert) {
    // typert 生成器的独立 emit 产物（不进 bundle）：host 面给宿主装配 wire codec，
    // remote-client 面给浏览器半边做类型化 RPC（TypertRemoteNamespaceMap 模块增强）。
    exports['./typert'] = { types: './lib/typert.host.d.ts', default: './lib/typert.host.js' }
    exports['./remote'] = { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' }
  }

  const dsh: Record<string, unknown> = { bundle: { patch: './cordis.patch.yml' } }
  if (hasClient) {
    // 官方 decoration 模板同款字段：platform 指渲染面；immediately = 启动即装载；
    // external = 非 baseline 运行时 import 的模块表请求清单（demo 只用 react 系 baseline，故空）。
    dsh.client = { platform: 'web', immediately: true, inject: [], external: [] }
  }

  const dependencies: Record<string, string> | undefined = hasTypert ? { zod: '^4.4.3' } : undefined

  const peerDependencies: Record<string, string> | undefined = hasHost
    ? {
        '@deepseek-ai/schemastery': SCHEMASTERY.peer,
        ...(hasTypert ? { '@deepseek-ai/dsh-typert-protocol': `>=${DSH_VERSION} <0.3.0-0` } : {}),
      }
    : undefined

  const devDependencies: Record<string, string> = {
    '@types/node': '^24',
    'js-yaml': '^4.1.0',
    tsdown: '^0.22.2',
    typescript: '^5.9',
    vitest: '^5.0.3',
  }
  if (hasHost) {
    // host 半边源码 import type { Context }：cordis 是类型源，dev 精确钉 checkout 同版
    devDependencies['@deepseek-ai/cordis'] = CORDIS_DEV
    // Config schema 用 schemastery：与宿主共享实例 → peer + dev 双声明（不变式 I1）
    devDependencies['@deepseek-ai/schemastery'] = SCHEMASTERY.dev
  }
  if (hasTypert) {
    // 生成器（typertPlugin 的来源）与协议包类型源：dev 精确钉 checkout 同版。
    // ⚠ 协议包 devDep 必须是裸精确版本（不带 ^ ~）：放宽成范围会让 packages/protocol
    // 的 -vendor.0 版本变成合法候选，运行期可能被链到没有产物的 vendor 副本。
    devDependencies['@deepseek-ai/dsh-typert-generator'] = DSH_VERSION
    devDependencies['@deepseek-ai/dsh-typert-protocol'] = DSH_VERSION
  }
  if (hasClient) {
    // react 从宿主浏览器模块表供给（构建外置）；本体与类型只服务本地 typecheck
    devDependencies['react'] = '^18.2.0'
    devDependencies['@types/react'] = '^18.2.0'
  }

  const scripts: Record<string, string> = {
    ...(hasTypert ? { preinstall: 'node scripts/ensure-protocol.mjs' } : {}),
    build: 'tsdown',
    dev: 'tsdown --watch',
    ...(hasHost ? { 'dev:hmr': 'node scripts/dev-hmr.mjs' } : {}),
    prepare: 'tsdown',
  }
  if (!hasTypert) {
    // 单包布局：测试与类型检查在本包跑（full 布局由 workspace 根壳承载）
    scripts.test = 'vitest run'
    scripts['test:watch'] = 'vitest'
    scripts.typecheck = 'tsc --noEmit'
  }

  // typert 生成器硬性校验：files 必须显式包含它要 emit 的 4 个产物文件
  // （缺一项构建期直接报「package files must include lib/typert.host.js」）。
  const files: string[] = hasTypert
    ? ['lib', 'lib/typert.host.js', 'lib/typert.host.d.ts', 'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts', 'src', 'cordis.patch.yml', 'locale', 'icon.svg']
    : ['lib', 'src', 'cordis.patch.yml', 'locale', 'icon.svg']

  return {
    name: packageName,
    description,
    version: '0.1.0',
    type: 'module',
    main: './lib/index.js',
    exports,
    files,
    scripts,
    keywords: ['dsh', 'deepseek-harness', 'cordis', pluginId],
    license: 'Apache-2.0',
    publishConfig: { access: 'public' },
    ...(hasTypert ? {} : { packageManager: 'pnpm@11.7.0' as const }),
    engines: { dsh: `>=${DSH_VERSION} <0.3.0-0` },
    dsh,
    ...(peerDependencies !== undefined ? { peerDependencies } : {}),
    ...(dependencies !== undefined ? { dependencies } : {}),
    devDependencies,
  }
}

/** 人读名（locale 的 meta.title 用）从包名推导：@scope/dsh-foo-bar → foo-bar。 */
export function titleOf(pluginId: string): string {
  return pluginId
}
