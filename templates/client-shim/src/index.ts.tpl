// __PACKAGE_NAME__ :: Node 半边入口（纯 client 插件的宿主壳）
//
// 官方形态（DSH skill cordis-plugin-development 的 templates/decoration/index.js）：
// client 为主体的插件，宿主半边只需要「插件存在」:空 apply。渲染与交互全部在
// 浏览器半边 src/client/，模块由宿主按 dsh.client 声明自动发现并装载。
// 需要宿主能力（tools / config / 服务）时再在这里加，别忘了同步 tsdown.config.ts
// （把单 client 配置换成 host + client 数组双配置，参照 create-dsh-plugin 的 full 模板）。

export const name = '__PLUGIN_ID__'

export function apply(): void {}
