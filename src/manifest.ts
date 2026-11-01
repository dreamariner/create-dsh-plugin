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
  /** 项目名（根壳 manifest 名的来源）；缺省 = pluginId。与包名解耦：
   *  多插件项目的项目名一般不该是第一个插件的名字。 */
  projectName?: string
}

/**
 * 三形态统一 workspace 布局（根壳 + packages/<id>/ 插件包）：
 * 默认一个插件，但结构上支持用 add 子命令追加任意多个插件。
 * full 的 typert 生成器结构性要求「被分析的包位于 <root>/packages/ 下」
 * （loadRegistrations 的 isWithin 检查，tsdown 插件路径 includeVendor 恒 false）；
 * host / client 与它统一布局后，add 新插件不需要迁移仓结构。
 */
export function buildManifests(input: ManifestInput): { root: Record<string, unknown>; plugin: Record<string, unknown> } {
  return {
    root: buildRootManifest(input),
    plugin: buildPackageManifest(input),
  }
}

/** workspace 根壳：private 壳，scripts 以 -r 递归转发（插件数无关），测试与类型检查在根。 */
function buildRootManifest(input: ManifestInput): Record<string, unknown> {
  const { type } = input
  // 根壳名跟项目名不跟包名。命名规则：
  //   缺省（项目名 = 插件 id）→ `<id>-workspace`：与 packages/<id>/ 的插件包区分开；
  //   显式 --project-name 且 ≠ 插件 id → 裸项目名：名字本身已无歧义，后缀反而累赘。
  // 根壳是 private 的，不发布，无 scope 语义。
  const custom = input.projectName !== undefined && input.projectName !== input.pluginId
  const projectName = custom ? input.projectName : `${input.projectName ?? input.pluginId}-workspace`
  return {
    name: projectName,
    private: true,
    version: '0.1.0',
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    scripts: {
      // -r = 递归全部 workspace 成员：add 新插件后无需改根壳
      build: 'pnpm -r build',
      dev: 'pnpm -r --parallel dev',
      ...(type === 'host' || type === 'full' ? { 'dev:hmr': 'pnpm -r dev:hmr' } : {}),
      // git 安装整仓时由 prepare 驱动全部插件包构建
      prepare: 'pnpm -r build',
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

/** 插件包 manifest（统一 workspace 布局：packages/<id>/）。 */
export function buildPackageManifest(input: ManifestInput): Record<string, unknown> {
  const { type, packageName, pluginId, description } = input

  const hasClient = type === 'client' || type === 'full'
  const hasHost = type === 'host' || type === 'full'
  const hasTypert = type === 'full'

  const exports: Record<string, unknown> = {
    '.': './lib/index.js',
    ...(hasClient ? { './client': './lib/client.js' } : {}),
    './src/*': './src/*',
    // 展示元数据的导出面（官方 host-plugin checklist 必查项：Plugin Manager 与
    // Settings 在不激活插件时经 exports 读取 locale 的 meta 与 icon）
    './locale/*.json': './locale/*.json',
    './icon': './icon.svg',
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
    // npm 只自动收录包目录内的 README / LICENSE（仓根的进不了 tarball）：
    // 打包前从仓根同步（产物 gitignore，真源在仓根）
    prepublishOnly: 'node scripts/sync-pack-docs.mjs',
  }
  // test / typecheck 由 workspace 根壳承载（根 vitest 与根 tsconfig 覆盖全部插件包）

  // typert 生成器硬性校验：files 必须显式包含它要 emit 的 4 个产物文件
  // （缺一项构建期直接报「package files must include lib/typert.host.js」）。
  const files: string[] = hasTypert
    ? ['lib', 'lib/typert.host.js', 'lib/typert.host.d.ts', 'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts', 'src', 'cordis.patch.yml', 'locale', 'icon.svg', 'README.md', 'LICENSE']
    : ['lib', 'src', 'cordis.patch.yml', 'locale', 'icon.svg', 'README.md', 'LICENSE']

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
