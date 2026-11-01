# __PACKAGE_NAME__

__DESCRIPTION__（由 create-dsh-plugin 生成的 DeepSeek Harness 插件，形态：**__PLUGIN_TYPE_LABEL__**）。

## 安装

```sh
dsh plugin --profile <name> add __PACKAGE_NAME__   # npm（发布后）
# 或从 git（pnpm 会在装后跑 prepare 自动构建 lib/）：
dsh plugin --profile <name> add github:dreamariner/<repo>
```

> desktop profile 不接受 CLI 的 pnpm 转发：改用 app 内 Plugin Manager 安装，或
> `pnpm add __PACKAGE_NAME__ --dir <profile目录>` 直调。git 安装且 pnpm ≥ 10 时，
> 需在 profile 的 `pnpm-workspace.yaml` 放行构建脚本
> （`allowBuilds: { "__PACKAGE_NAME__": true }`）。

## 开发

```sh
pnpm install
pnpm dev           # watch 构建：保存即重建 lib/
pnpm dev:hmr       # host 半边热重载接线（见下）
pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm build         # 单次构建
```

- **pnpm dev**：watch 重建 `lib/index.js`（host 半边）与 `lib/client.js`（client 半边，若有）。
- **pnpm dev:hmr**（host / full）：把本包 `lib/` 注册进本机 home patch
  （`$DSH_HOME/cordis.patch.yml`）的 hmr watch 根。**注册后需重启实例一次**，之后的
  host 半边改动随 `pnpm dev` 重建即时热重载（免重启、PID 不变）。`--remove` 注销。
- **client 半边免接线**：DSH 的 client-hmr 自动盯着 `lib/client.js`，重建即热替换，
  不需要（也不应该）把它加进 hmr root。

## 发布

```sh
pnpm publish       # prepare 自动构建 lib/ 再打包；scoped 包已配 access=public
```

发布前检查：`locale/*.json` 的 `meta.title` / `meta.description` 换成真实文案、
`icon.svg` 换成原创图形（Plugin Manager 与 Settings 会展示它们）。

## 结构

```
src/index.ts        宿主半边入口（apply + inject + Config）   ← host/full
src/config.ts       配置 schema（schemastery，peer 共享宿主实例） ← host/full
src/client/index.tsx 浏览器半边入口（槽位注册，React）          ← client/full
cordis.patch.yml    自挂载 bundle patch
locale/*.json       展示元数据（meta.title / meta.description）
icon.svg            插件图标（≤ 256 KiB）
scripts/dev-hmr.mjs host 半边 hmr 接线脚本                       ← host/full
scripts/lib/manifest-deps.mjs  依赖策略单一来源（不变式 I1/I2）    ← host/full
tests/              bundle 形态守卫 / client 边界护栏 / 自身用例
```

## 依赖纪律（不变式，改动前必读）

名单只写在 `package.json` 一处，`tsdown.config.ts` 从它派生：

- `peerDependencies`（schemastery）＝宿主供给同一实例 → 构建外置；
- `dependencies` ＝插件自带 → 构建内联；
- `devDependencies` ＝只许 `import type`（类型源，dev 精确钉版本）。

client 半边的模块表请求（react 系）由宿主渲染进程供给，清单在 `tsdown.config.ts`
的 `EXTERNALS`，**不能**从 manifest 派生（那是宿主契约不是依赖声明）。

## 下一步

- host 能力扩展点：tools / systemPrompt / provider / listener，选最弱的够用机制
  （官方 practices：restrict < guard < waterfall < 整体替换）。
- client UI：槽位注册见 `src/client/index.tsx` 顶部注释；控件别 require 任何
  `@deepseek-ai/dsh-client-*` 包（官方 practices 明令），照宿主的样子自己写，
  样式只引用 `--dsw-alias-*` 主题 token。
- client 与 host 之间的类型化 RPC：用 typert codegen。协议声明源用共享仓
  `dreamariner/dsh-typert-protocol`（submodule 挂 `packages/protocol`，见其 README
  的消费方接入手册；生成器接线三道门槛与四件配置同样在那里）。
