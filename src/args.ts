// create-dsh-plugin :: 命令行参数解析（手写，零依赖）
//
// 用法：
//   npx @dreamariner/create-dsh-plugin [add] [name] [--type host|client|full] [--dir <dir>]
//                                      [--title <t>] [--description <d>]
//                                      [--protocol-url <u>] [--no-install] [--no-git]
// 缺省的项回落到交互式提问。
//
// 两个子命令共用一套参数：
//   create（缺省）：新建插件仓（根壳 + packages/<id>/ 默认插件），--dir = 生成目录；
//   add：向既有 workspace 仓追加一个插件包，--dir = 仓根（缺省当前目录）。

import type { Command, PluginType } from './types.ts'

export interface CliArgs {
  command: Command
  name?: string
  type?: PluginType
  dir?: string
  title?: string
  description?: string
  /** typert 协议声明源共享仓的 git URL（full 形态自动挂 submodule 用）。 */
  protocolUrl?: string
  install: boolean
  git: boolean
  help: boolean
}

const TYPE_VALUES = new Set<PluginType>(['host', 'client', 'full'])

export function parseArgs(argv: string[]): CliArgs {
  // 子命令：argv[0] 显式写 create / add 之一时按它分发，否则缺省 create
  let command: Command = 'create'
  let rest = argv
  if (argv[0] === 'add') {
    command = 'add'
    rest = argv.slice(1)
  } else if (argv[0] === 'create') {
    rest = argv.slice(1)
  }

  const out: CliArgs = { command, install: true, git: true, help: false, protocolUrl: undefined }
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    switch (a) {
      case '--type': {
        const v = rest[++i]
        if (v === undefined || !TYPE_VALUES.has(v as PluginType)) {
          throw new Error(`--type 需要取值 host | client | full（收到：${v ?? '缺失'}）`)
        }
        out.type = v as PluginType
        break
      }
      case '--dir':
        out.dir = rest[++i]
        break
      case '--title':
        out.title = rest[++i]
        break
      case '--description':
        out.description = rest[++i]
        break
      case '--protocol-url':
        out.protocolUrl = rest[++i]
        break
      case '--no-install':
        out.install = false
        break
      case '--no-git':
        out.git = false
        break
      case '-h':
      case '--help':
        out.help = true
        break
      default:
        if (a.startsWith('-')) throw new Error(`未知参数：${a}（--help 查看用法）`)
        positional.push(a)
    }
  }
  if (positional.length > 1) throw new Error(`最多一个位置参数（包名），收到：${positional.join(' ')}`)
  out.name = positional[0]
  return out
}

/** npm 包名合法性：可带 scope 的 @scope/name 或无 scope 的 name（小写字母数字 - . _）。 */
const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export function validateName(name: string): string | undefined {
  if (!NAME_RE.test(name)) return '包名不合法：需为小写的 @scope/name 或 name（字母数字 - . _）'
  if (pluginIdOf(name) === '') return '包名去掉 scope 后不能为空'
  return undefined
}

/** cordis 插件行 id：包名去掉 scope。 */
export function pluginIdOf(packageName: string): string {
  return packageName.includes('/') ? packageName.slice(packageName.indexOf('/') + 1) : packageName
}

/** 从包名推导 PascalCase 标识（配置接口名用）：@scope/dsh-foo-bar → FooBar。 */
export function pascalOf(packageName: string): string {
  const id = pluginIdOf(packageName).replace(/^dsh-/, '')
  return id
    .split(/[-._]/)
    .filter((p) => p !== '')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('') || 'Plugin'
}

/** 从包名推导 camelCase 服务键（typert Remote 的 service key / Context 增强属性名）：
 *  @scope/dsh-foo-bar → fooBar。typert 生成器要求 service key 是合法标识符。 */
export function camelOf(packageName: string): string {
  const id = pluginIdOf(packageName).replace(/^dsh-/, '')
  const camel = id
    .split(/[-._]/)
    .filter((p) => p !== '')
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('')
  return /^[A-Za-z_$][\w$]*$/.test(camel) ? camel : 'plugin'
}
