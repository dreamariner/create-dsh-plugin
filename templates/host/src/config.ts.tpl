// __PACKAGE_NAME__ 配置
// 校验语义：默认值填充 + 带路径的类型报错。schemastery 与宿主共享同一实例
// （peerDependencies 声明 + dev 精确钉版本），不要改成普通 dependency。

import z from '@deepseek-ai/schemastery'

export interface __PASCAL_NAME__Config {
  /** 示例旋钮：demo tool 的描述文案。正式开发时替换成你自己的配置项。 */
  pingDescription: string
}

export const Config: z<__PASCAL_NAME__Config> = z.object({
  pingDescription: z.string().default('示例工具：回显一条消息，验证插件装载与 tool 注册链路'),
})

/** 已知键（schemastery 的 Schema 类型不暴露 properties，故显式列出）。 */
export const KNOWN_KEYS = ['pingDescription'] as const

/** schemastery 标准校验的同步封装：默认值填充 + 带路径报错；不支持异步校验。 */
export function resolveConfig<T>(schema: z<T>, raw: unknown, plugin: string): T {
  const result = (schema as unknown as { '~standard': { validate: (v: unknown) => unknown } })['~standard'].validate(raw) as
    | { issues?: Array<{ path?: string[]; message: string }>; value?: T }
    | undefined
  if (result === undefined || result === null) throw new Error(`[${plugin}] 配置校验无返回`)
  if (typeof (result as { then?: unknown }).then === 'function') {
    throw new TypeError(`[${plugin}] 不支持异步配置校验`)
  }
  if (result.issues !== undefined && result.issues.length > 0) {
    const detail = result.issues.map((i) => `${(i.path ?? []).join('.') || '(root)'}: ${i.message}`).join('；')
    throw new Error(`[${plugin}] 配置校验失败：${detail}`)
  }
  return result.value as T
}
