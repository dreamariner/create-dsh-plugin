# __PROJECT_NAME__

__PACKAGE_NAME__：__DESCRIPTION__（由 create-dsh-plugin 生成的 DeepSeek Harness 插件，形态：**__PLUGIN_TYPE_LABEL__**）。

> 项目名与包名是两回事：项目名（本目录 / 根壳 manifest 名，缺省 = 首个插件 id，
> `--project-name` 自定义）标识这个仓；包名标识 `packages/` 下的插件包（发布与
> 安装都认它）。多插件项目里两者通常不同。

本仓是 workspace 布局：根壳承载测试与类型检查，插件包在 `packages/<id>/`（构建 / 发布 /
安装都以它为单位）。默认含一个插件，`add` 子命令可继续追加，结构无需迁移。

## 安装

```sh
dsh plugin --profile <name> add __PACKAGE_NAME__   # npm（发布后）
# 从 git 安装：workspace 仓的 dsh CLI github: 形态装的是仓根壳（无 dsh.bundle，
# 会被插件管理器跳过），要用 pnpm 的 path: 语法直装插件包子目录：
pnpm add "github:<owner>/<repo>#path:packages/__PLUGIN_ID__" --dir <profile目录>
```

<!--#if full-->
> 从 git clone 本仓后先补协议声明源 submodule：`git submodule update --init packages/protocol`
> （preinstall 守卫会在缺失时给出同样指引）。

<!--#endif-->
> git 安装且 pnpm ≥ 10 时，需在 profile 的 `pnpm-workspace.yaml` 放行构建脚本
> （`allowBuilds: { "__PACKAGE_NAME__": true }`，pnpm 10 的键名是
> `onlyBuiltDependencies`；lib/ 已随仓提交，放行前也能装上，放行是为了 prepare
> 能重建到最新源码）。desktop profile 不接受 CLI 的 pnpm 转发：改用 app 内
> Plugin Manager 安装。

## 开发

```sh
pnpm install
pnpm dev           # watch 构建全部插件包：保存即重建 lib/
<!--#if host|full-->pnpm dev:hmr       # host 半边热重载接线（见下）
<!--#endif-->pnpm test          # vitest run（根配置通配 packages/*/tests/）
pnpm typecheck     # tsc --noEmit（根 tsconfig 通配全部插件包）
pnpm build         # 单次构建（pnpm -r build）
```

- **pnpm dev**：watch 重建各包 `lib/index.js`（host 半边）与 `lib/client.js`（client 半边，若有）。
<!--#if host|full-->
- **pnpm dev:hmr**：把各包 `lib/` 注册进本机 home patch
  （`$DSH_HOME/cordis.patch.yml`）的 hmr watch 根。**注册后需重启实例一次**，之后的
  host 半边改动随 `pnpm dev` 重建即时热重载（免重启、PID 不变）。`--remove` 注销。
<!--#endif-->
<!--#if client|full-->
- **client 半边免接线**：DSH 的 client-hmr 自动盯着 `lib/client.js`，重建即热替换，
  不需要（也不应该）把它加进 hmr root。
<!--#endif-->

## 追加插件

在仓根执行（三形态同一种结构，加包不改根）：

```sh
npx @dreamariner/create-dsh-plugin add <包名> --type host|client|full
```

- 根壳脚本按 `pnpm -r` 递归转发，根 vitest / 根 tsconfig 按 `packages/*` 通配，
  新插件包自动被收编，无需改任何根文件
- 追加 `full` 形态会自动补协议声明源 submodule 与 `tsconfig.host.json` 的 face 引用
- 每个插件包独立发布：`pnpm --filter <包名> publish`

## 发布

```sh
pnpm --filter __PACKAGE_NAME__ publish   # prepare 自动构建 lib/ 再打包；scoped 包已配 access=public
```

发布前检查：`packages/__PLUGIN_ID__/locale/*.json` 的 `meta.title` / `meta.description`
换成真实文案、`icon.svg` 换成原创图形（Plugin Manager 与 Settings 会展示它们）。

## 结构

```
packages/__PLUGIN_ID__/
src/index.ts        宿主半边入口（apply + inject + Config）
<!--#if host|full-->src/config.ts       配置 schema（schemastery，peer 共享宿主实例）
<!--#endif--><!--#if full-->src/remote.ts      Typert Remote 契约（codegen 单一来源，标准装饰器）
<!--#endif--><!--#if client|full-->src/client/index.tsx 浏览器半边入口（槽位注册，React）
<!--#endif-->cordis.patch.yml    自挂载 bundle patch
locale/*.json       展示元数据（meta.title / meta.description）
icon.svg            插件图标（≤ 256 KiB）
<!--#if host|full-->scripts/dev-hmr.mjs host 半边 hmr 接线脚本
scripts/lib/manifest-deps.mjs  依赖策略单一来源（不变式 I1/I2）
<!--#endif--><!--#if full-->tsconfig.typert.json  typert face program（生成器解析本包源码用）
<!--#endif-->tests/              bundle 形态守卫 / client 边界护栏 / 自身用例
<!--#if full-->tsconfig.host.json    typert 生成器的 workspace 聚合配置（registration + paths 重定向）
packages/protocol/  协议声明源 submodule（dreamariner/dsh-typert-protocol）
<!--#endif-->```

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
   references 构成 registration；仓里每加一个 full 插件，`add` 会自动追加一条
   引用）+ `tsconfig.typert.json`（生成器解析本包源码）。
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

**SSH 与 HTTPS**：`.gitmodules` 里记录的是 SSH 形态（协作者配一次 GitHub key 即可）。
本机想走 HTTPS（PAT 或凭据助手），用 git 的 URL 重写，不用改 `.gitmodules`：

```sh
git config --global url."https://github.com/".insteadOf "git@github.com:"
```

反向同理（`.gitmodules` 是 HTTPS 基线时，有 key 的人重写回 SSH）。git 没有
「多 URL 依次回退」，`insteadOf` 是官方机制；注意 npm 式的 `git+https://` 前缀
git 不认识，`.gitmodules` 里不能这么写。

**client 侧消费**（生成产物 `lib/typert.remote-client.js` 已就绪，接法三行）：

```ts
import { TYPERT_REMOTE } from '__PACKAGE_NAME__/remote'   // 生成产物（不要从 src/remote.ts 值导入:会把协议包拖进浏览器 bundle）
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
