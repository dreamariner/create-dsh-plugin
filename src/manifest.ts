// create-dsh-plugin :: 生成项目 package.json 的程序化构造
//
// 为什么不用文本模板：package.json 的字段按类型差异大（exports / dsh.client /
// peerDependencies / devDependencies），程序化构造 + JSON.stringify 保证格式合法、
// 字段顺序稳定。数值与形态全部来自实测可运行的参照：
//   · host 形态照 @dreamariner/dsh-web-search-minimax（npm 可发布、git 可安装）；
//   · client / full 的 client 声明照 DSH 官方 decoration 模板与 同代外部插件仓。

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

export function buildManifest(input: ManifestInput): Record<string, unknown> {
  const { type, packageName, pluginId, description } = input

  const hasClient = type === 'client' || type === 'full'
  const hasHost = type === 'host' || type === 'full'

  const exports: Record<string, string> = {
    '.': './lib/index.js',
    ...(hasClient ? { './client': './lib/client.js' } : {}),
    './src/*': './src/*',
    './package.json': './package.json',
  }

  const dsh: Record<string, unknown> = { bundle: { patch: './cordis.patch.yml' } }
  if (hasClient) {
    // 官方 decoration 模板同款字段：platform 指渲染面；immediately = 启动即装载；
    // external = 非 baseline 运行时 import 的模块表请求清单（demo 只用 react 系 baseline，故空）。
    dsh.client = { platform: 'web', immediately: true, inject: [], external: [] }
  }

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
  if (hasClient) {
    // react 从宿主浏览器模块表供给（构建外置）；本体与类型只服务本地 typecheck
    devDependencies['react'] = '^18.2.0'
    devDependencies['@types/react'] = '^18.2.0'
  }

  return {
    name: packageName,
    description,
    version: '0.1.0',
    type: 'module',
    main: './lib/index.js',
    exports,
    files: ['lib', 'src', 'cordis.patch.yml', 'locale', 'icon.svg'],
    scripts: {
      build: 'tsdown',
      dev: 'tsdown --watch',
      ...(hasHost ? { 'dev:hmr': 'node scripts/dev-hmr.mjs' } : {}),
      prepare: 'tsdown',
      test: 'vitest run',
      'test:watch': 'vitest',
      typecheck: 'tsc --noEmit',
    },
    keywords: ['dsh', 'deepseek-harness', 'cordis', pluginId],
    license: 'Apache-2.0',
    publishConfig: { access: 'public' },
    packageManager: 'pnpm@11.7.0',
    engines: { dsh: `>=${DSH_VERSION} <0.3.0-0` },
    dsh,
    ...(hasHost ? { peerDependencies: { '@deepseek-ai/schemastery': SCHEMASTERY.peer } } : {}),
    devDependencies,
  }
}

/** 人读名（locale 的 meta.title 用）从包名推导：@scope/dsh-foo-bar → foo-bar。 */
export function titleOf(pluginId: string): string {
  return pluginId
}
