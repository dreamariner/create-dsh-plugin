// __PACKAGE_NAME__ :: Node 半边入口
//
// cordis 插件接口三件套：export function apply(ctx, config) + 可选 export const inject
// + 可选 export const Config（声明了它，插件行的 config 就会在激活期被 schema 校验）。
//
// ⚠ inject 是白名单：只声明的 service 才会出现在 ctx 上，漏声明不报错，只是
//   ctx.tools 为 undefined；而 loader 静默吞掉插件异常，表现为「插件静默失效」。
//   所以本模板对服务取用一律「取不到就明确抛错」，宁可装载失败也不要静默。
//
// 本 demo 注册一个无副作用的示例 tool，验证「装载 → 注册 → Agent 可见」链路；
// 正式开发时替换成你的扩展点（tools / systemPrompt / provider / listener，
// 按官方 practices 选最弱的够用机制）。

import type { Context } from '@deepseek-ai/cordis'
import { Config, KNOWN_KEYS, resolveConfig, type __PASCAL_NAME__Config } from './config.ts'

export const name = '__PLUGIN_ID__'
export const inject = ['tools']
export { Config }

/** 本插件用到的 tools 服务面（窄化：只声明用到的成员，cordis 的 Context 类型很宽）。 */
interface ToolsService {
  register(tool: {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: { schema: { type: string }; render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }> }
    execute: (args: unknown) => Promise<string>
  }): void
}

export function apply(ctx: Context, rawConfig?: Partial<__PASCAL_NAME__Config> | null): void {
  // patch 里没有 config 时 YAML 会解析出 null，默认参数只对 undefined 生效，故显式兜底
  const config = resolveConfig(Config, rawConfig ?? {}, name)
  const log = (...args: unknown[]): void => { ctx.logger?.info?.(`[${name}]`, ...args) }

  const tools = (ctx as unknown as { tools?: ToolsService }).tools
  if (tools === undefined || typeof tools.register !== 'function') {
    throw new Error(`[${name}] ctx.tools 不可用——inject 白名单声明（['tools']）与服务实际名称不一致`)
  }

  const toolName = '__PLUGIN_ID___ping'
  tools.register({
    name: toolName,
    description: config.pingDescription,
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要回显的文本' },
      },
      required: ['message'],
    },
    // 所有 tool 输出统一纯文本：模型不必二次解析结构化结果
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    execute: async (args: unknown) => {
      const { message } = args as { message: string }
      return `pong: ${message}`
    },
  })
  log(`tool 已注册：${toolName}（把 apply 里的注册换成你自己的扩展点）`)
}

// KNOWN_KEYS 导出给测试用（未知配置键守卫）；resolveConfig 的校验语义见 config.ts
export { KNOWN_KEYS }
