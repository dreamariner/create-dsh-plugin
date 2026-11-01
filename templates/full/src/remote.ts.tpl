// __PACKAGE_NAME__ :: Typert Remote 契约（codegen 的单一来源）
//
// 本文件用标准装饰器（TC39，TS 5.9 原生）声明 wire 契约；构建期 typertPlugin 会：
//   ① 把标准装饰器降级为可运行形态（rolldown/oxc 原生不降标准装饰器）；
//   ② 从装饰器方法生成 lib/typert.host.*（服务类型 + wire codec）与
//      lib/typert.remote-client.*（client 侧契约 + 类型化 RPC 客户端）。
//
// 契约约束（违反会在构建期或运行期踩坑）：
//   · 方法名 = wire 端点名；形参名必须与 wire 名逐字一致（统一 args，末位 signal）；
//   · super(ctx, '<key>') 的服务键必须是字符串字面量（标识符会报
//     "Gateway service key must be a string literal"），且与下方 Context 增强的
//     属性名一致；
//   · 本类必须在 src/index.ts 里 re-export：生成器从包的 export 图收集符号，
//     漏 export = 生成器看不见它。
//
// 正式开发时把示例方法换成你自己的 wire 面；实现复杂时委托到独立 handlers 模块
// （薄契约 + 可单测的实现，与本文件分离）。

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

// 服务契约的 Context 增强：client 与宿主侧都能类型化地访问 ctx.remote.<key>。
declare module '@deepseek-ai/cordis' {
  interface Context {
    __SERVICE_KEY__: __PASCAL_NAME__Remote
  }
}

export class __PASCAL_NAME__Remote extends TypertRemoteService {
  constructor(ctx: any) {
    // ⚠ 字符串字面量（见上）；与 Context 增强属性名一致
    super(ctx, '__SERVICE_KEY__')
  }

  /** 无参探活：验证 wire 链路（client 调 ctx.remote.__SERVICE_KEY__.ping()）。 */
  @Remote('ping')
  ping(signal: AbortSignal): Promise<{ pong: true }> {
    signal.throwIfAborted()
    return Promise.resolve({ pong: true })
  }

  /** 带参回显：展示 args 形参约定（形参名 = wire 名）。 */
  @Remote('echo')
  echo(args: { message: string }, signal: AbortSignal): Promise<{ echoed: string }> {
    signal.throwIfAborted()
    return Promise.resolve({ echoed: args.message })
  }
}
