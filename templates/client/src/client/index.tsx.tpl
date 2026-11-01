// __PACKAGE_NAME__ :: 浏览器半边入口
//
// 官方形态（DSH skill cordis-plugin-development 的 templates/decoration/client.js）：
//   · 产物 lib/client.js 被 tsdown.config.ts 包上 window.__ModuleLoader__.load({...})
//     的 CJS 包装；factory 返回 { inject, apply } : 与 host 插件同构的 cordis 接口；
//   · react 来自宿主渲染进程模块表（构建时 EXTERNALS 外置），不打包、不 CDN、不自装。
//
// ⚠ 官方 practices（违反会坏或难看，逐条对照）：
//   · 不 require 任何 @deepseek-ai/dsh-client-* 包 : 清单随时可能变，也不在你的
//     模块表请求里；控件照宿主的样子自己写；
//   · 样式只引用 --dsw-alias-* 主题 token（亮暗自适应）；字面颜色只留给插画；
//   · 不往 document.body 追加节点、不替换应用根、不读别的插件的 DOM；
//   · 槽位选「已分配空间」的（如 conversation.composer.dock）；换槽位前先查它的
//     注册选项与 props（宿主 Slots.listSubTree）；
//   · 定时器 / 监听 / 样式等资源在 ctx.effect 里注册并返回清理函数。

import type { ReactNode } from 'react'

export const inject = ['slots']

/** 本插件用到的 slots 服务面（窄化：只声明用到的成员）。 */
interface SlotsService {
  inject(ownerKey: string, register: () => void): void
  register(options: { name: string; id: string; order?: number }, component: unknown): void
}

export function apply(rawCtx: unknown): void {
  const ctx = rawCtx as { slots?: SlotsService }
  const slots = ctx.slots
  if (slots === undefined || typeof slots.inject !== 'function') {
    throw new Error(`[${'__PLUGIN_ID__'}] ctx.slots 不可用:inject 白名单声明（['slots']）与服务实际名称不一致`)
  }

  // 输入框下方的占位徽标：验证「装载 → 槽位注册 → 渲染」链路，替换成你的第一块 UI。
  slots.inject('conversation.composer.dock', () => slots.register(
    {
      name: 'conversation.composer.dock',
      id: '__PLUGIN_ID__',
      order: 5,
    },
    ComposerBadge,
  ))
}

function ComposerBadge(): ReactNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
        __TITLE__ · client 半边已装载
      </span>
    </div>
  )
}
