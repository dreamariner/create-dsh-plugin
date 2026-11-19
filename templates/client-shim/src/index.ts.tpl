// __PACKAGE_NAME__ :: Node 半边入口（纯 client 插件的宿主壳）
//
// 官方形态（DSH skill cordis-plugin-development 的 templates/decoration/index.js）：
// client 为主体的插件，宿主半边只需要「插件存在」:空 apply。渲染与交互全部在
// 浏览器半边 src/client/，模块由宿主按 dsh.client 声明自动发现并装载。
//
// ⚠ 这个壳不是死代码：它由 tsdown.host.config.ts 构建成 lib/index.js，正是 manifest
//   的 main / exports['.'] 指向的入口（bundle patch 的插件行靠它解析，缺了 = 装载
//   断链，插件静默不出现）。官方 decoration 模板同样同时发布 index.js 与 client.js。
//
// 需要宿主能力（tools / config / 服务）时在这里加，并同步 tsdown.host.config.ts 与
// package.json 的依赖声明（peer 外置 / dependencies 内联 / devDependencies 只许
// import type，见 AGENTS.md 的依赖决策表）。

export const name = '__PLUGIN_ID__'

export function apply(): void {}
