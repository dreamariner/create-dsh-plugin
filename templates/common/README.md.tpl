# __PACKAGE_NAME__

__DESCRIPTION__（由 create-dsh-plugin 生成的 DeepSeek Harness 插件，形态：**__PLUGIN_TYPE_LABEL__**）。

## 安装

```sh
dsh plugin --profile <name> add __PACKAGE_NAME__   # npm（发布后）
# 或从 git（pnpm 会在装后跑 prepare 自动构建 lib/）：
dsh plugin --profile <name> add github:dreamariner/<repo>
```

<!--#if full-->
> 从 git clone 本仓后先补协议声明源 submodule：`git submodule update --init packages/protocol`
> （preinstall 守卫会在缺失时给出同样指引）。

<!--#endif-->
> desktop profile 不接受 CLI 的 pnpm 转发：改用 app 内 Plugin Manager 安装，或
> `pnpm add __PACKAGE_NAME__ --dir <profile目录>` 直调。git 安装且 pnpm ≥ 10 时，
> 需在 profile 的 `pnpm-workspace.yaml` 放行构建脚本
> （`allowBuilds: { "__PACKAGE_NAME__": true }`）。

## 开发

```sh
pnpm install
pnpm dev           # watch 构建：保存即重建 lib/
<!--#if host|full-->pnpm dev:hmr       # host 半边热重载接线（见下）
<!--#endif-->pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm build         # 单次构建
```

- **pnpm dev**：watch 重建 `lib/index.js`（host 半边）与 `lib/client.js`（client 半边，若有）。
<!--#if host|full-->
- **pnpm dev:hmr**：把本包 `lib/` 注册进本机 home patch
  （`$DSH_HOME/cordis.patch.yml`）的 hmr watch 根。**注册后需重启实例一次**，之后的
  host 半边改动随 `pnpm dev` 重建即时热重载（免重启、PID 不变）。`--remove` 注销。
<!--#endif-->
<!--#if client|full-->
- **client 半边免接线**：DSH 的 client-hmr 自动盯着 `lib/client.js`，重建即热替换，
  不需要（也不应该）把它加进 hmr root。
<!--#endif-->

## 发布

```sh
pnpm publish       # prepare 自动构建 lib/ 再打包；scoped 包已配 access=public
```

发布前检查：`locale/*.json` 的 `meta.title` / `meta.description` 换成真实文案、
`icon.svg` 换成原创图形（Plugin Manager 与 Settings 会展示它们）。

## 结构

<!--#if full-->
workspace 布局（typert 生成器结构性要求插件包位于 `packages/` 下）：根壳承载测试与
类型检查，插件包在 `packages/__PLUGIN_ID__/`（构建 / 发布 / 安装都以它为单位），
`packages/protocol/` 是协议声明源 submodule。

<!--#endif-->
```
src/index.ts        宿主半边入口（apply + inject + Config）
src/config.ts       配置 schema（schemastery，peer 共享宿主实例）
<!--#if full-->src/remote.ts      Typert Remote 契约（codegen 单一来源，标准装饰器）
<!--#endif--><!--#if client|full-->src/client/index.tsx 浏览器半边入口（槽位注册，React）
<!--#endif-->cordis.patch.yml    自挂载 bundle patch
locale/*.json       展示元数据（meta.title / meta.description）
icon.svg            插件图标（≤ 256 KiB）
<!--#if host|full-->scripts/dev-hmr.mjs host 半边 hmr 接线脚本
scripts/lib/manifest-deps.mjs  依赖策略单一来源（不变式 I1/I2）
<!--#endif--><!--#if full-->tsconfig.host.json    typert 生成器的 workspace 聚合配置（registration + paths 重定向）
packages/protocol/  协议声明源 submodule（dreamariner/dsh-typert-protocol）
<!--#endif-->tests/              bundle 形态守卫 / client 边界护栏 / 自身用例
```

## 依赖纪律（不变式，改动前必读）

名单只写在 `package.json` 一处，`tsdown.config.ts` 从它派生：

- `peerDependencies`（schemastery<!--#if full-->、dsh-typert-protocol<!--#endif-->）＝宿主供给同一实例 → 构建外置；
- `dependencies`（<!--#if full-->zod、<!--#endif-->若有）＝插件自带 → 构建内联；
- `devDependencies` ＝只许 `import type`（类型源，dev 精确钉版本）。

client 半边的模块表请求（react 系）由宿主渲染进程供给，清单在 `tsdown.config.ts`
的 `EXTERNALS`，**不能**从 manifest 派生（那是宿主契约不是依赖声明）。

<!--#if full-->
## typert：client 与 host 的类型化 RPC

本模板已接好 typert codegen 全链路，四件接线缺一不可（护栏守着）：

1. **协议声明源**：`packages/protocol`（git submodule，共享仓
   `dreamariner/dsh-typert-protocol`），挂载路径不可挪（生成器结构性要求：
   workspace registration 必须位于 `<root>/packages/` 下，且它对路径做 realPath，
   软链会失效）。
2. **face 配置**：`tsconfig.host.json`（聚合：paths 把协议说明符重定向进声明源 +
   references 构成 registration）+ `tsconfig.typert.json`（生成器解析本包源码）。
   两个文件只被生成器读，根 `tsconfig.json` 已 exclude 声明源目录（避免与 npm 包
   d.ts 的 Context 增强撞 TS2717）。
3. **构建接线**：`tsdown.config.ts` host 段的 `typertPlugin({ mode: 'workspace',
   faces: ['host'] })`，构建时生成 `lib/typert.host.*`（宿主侧 wire codec）与
   `lib/typert.remote-client.*`（client 侧类型化 RPC）。
4. **manifest**：协议包 peer（宿主供给同一实例）+ devDep **裸精确 pin**（放宽成
   范围会让 vendor 副本变成运行期候选）+ zod dependencies（生成产物 import 它）。

写法要点（都在 `src/remote.ts` 注释里）：服务键必须字符串字面量、类必须从
`src/index.ts` re-export、形参名与 wire 名逐字一致。

**升级协议声明源**（跟随 DSH 泳道）：

```sh
cd packages/protocol
DSH_CHECKOUT=<DSH 仓库 checkout 路径> node scripts/vendor-protocol.mjs --check   # 校验
DSH_CHECKOUT=<DSH 仓库 checkout 路径> node scripts/vendor-protocol.mjs           # 同步
cd ../.. && pnpm test                                  # 全部护栏（含共享仓自守与消费端守卫）
git -C packages/protocol add -A && git -C packages/protocol commit -m "chore: sync upstream" && git -C packages/protocol push
git add packages/protocol                              # 本仓记录新指针
```

**client 侧消费**（生成产物 `lib/typert.remote-client.js` 已就绪，接法三行）：

```ts
import { TYPERT_REMOTE } from '__PACKAGE_NAME__/remote'   // 生成产物（不要从 src/remote.ts 值导入——会把协议包拖进浏览器 bundle）
// client 半边的 apply 里：
ctx.effect(() => ctx.remote.$mount(TYPERT_REMOTE), 'mount remote')
// 之后 ctx.remote.__SERVICE_KEY__.ping() 全程类型化
```

接之前把 `'@deepseek-ai/dsh-typert-protocol'` 加进 `tsdown.config.ts` client 段的
`EXTERNALS`（它的运行时由宿主渲染进程模块表供给；清单外会被内联，protocol 包不在
你的 dependencies 里，内联解析不到）。
<!--#endif-->

## 下一步

- host 能力扩展点：tools / systemPrompt / provider / listener，选最弱的够用机制
  （官方 practices：restrict < guard < waterfall < 整体替换）。
- client UI：槽位注册见 `src/client/index.tsx` 顶部注释；控件别 require 任何
  `@deepseek-ai/dsh-client-*` 包（官方 practices 明令），照宿主的样子自己写，
  样式只引用 `--dsw-alias-*` 主题 token。
