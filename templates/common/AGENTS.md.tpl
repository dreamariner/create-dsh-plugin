# AGENTS.md · __PROJECT_NAME__

> Agent 进仓先读本文：项目定位、形态不变量、门禁与红线。人向的安装与使用说明在 [README.md](README.md)。

## 项目定位

__PACKAGE_NAME__：__DESCRIPTION__。由 create-dsh-plugin 生成的 DeepSeek Harness（DSH）插件，形态：**__PLUGIN_TYPE_LABEL__**。

## 形态速记

<!--#if single-->
- 单包布局：根即插件包（`src/` 源码 → `lib/` 构建产物），npm 发布 / `dsh plugin add` / `profile:add` 都以本仓为单位。
<!--#endif-->
<!--#if workspace-->
- workspace 布局：根壳承载测试与类型检查，插件包在 `packages/__PLUGIN_ID__/`；`add` 子命令可继续追加插件，无需迁移结构。
<!--#endif-->
<!--#if client|full-->
- client 半边入口 `src/client/index.tsx`，经 `dsh.client` manifest 声明由宿主渲染进程装载（`./client` 导出面）。
<!--#endif-->
<!--#if full-->
- typert face：client → host 的类型化 RPC，声明在 `src/remote.ts`，构建期生成 `lib/typert.host.*` 与 `lib/typert.remote-client.*`；协议声明源是 `packages/protocol` submodule（pinned vendor，勿在本仓改它的内容）。
<!--#endif-->

## 常用命令

```sh
pnpm install        # 首次
pnpm build          # 构建（产物进 lib/，不入库）
pnpm test           # 自守护栏测试
pnpm typecheck
pnpm dev            # watch 重建
<!--#if host|full-->
pnpm dev:hmr        # host 半边热重载接线（client 半边重建即热替换）
<!--#endif-->
pnpm profile:add    # link: 安装进 ~/.dsh/profiles/desktop（缺依赖自动 install、装前自动构建、登记名单、自检）
```

## 红线

- **lib 不入库**：构建产物不进 git。gitignore 已按布局锚定（single = `/lib/`，workspace = `packages/*/lib/`）；勿改回裸 `lib/`，那会任意深度匹配误伤 `scripts/lib/` 共享模块，clone 出来的仓 build 直接挂。
- **发布面不含 src**：`files` 白名单与 `exports` 都不带源码；`./src/*` 是官方 client 包的 monorepo 内约定，独立发行插件无人消费。
- **DSH 版本锚 `0.2.1-rc.3`**：peerDependencies 范围与 `engines.dsh` 都锚在此，升级时同步 `package.json` 与注释。
<!--#if host|full-->
- **schemastery 双声明**：peer（与宿主共享实例）+ dev（精确钉本仓 typecheck），缺一会装出两份实例。
<!--#endif-->
- **行文不用破折号「——」**（zero 知识库行文规范，2026-11-01 起）。
