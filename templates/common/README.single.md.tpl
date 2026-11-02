# __PACKAGE_NAME__

__DESCRIPTION__（由 create-dsh-plugin 生成的 DeepSeek Harness 插件，形态：**__PLUGIN_TYPE_LABEL__**）。

本仓是**单包布局**：根即插件包，构建、发布、安装都以本仓为单位。lib/ 是构建产物，不进 git。

## 安装

**想用**（npm 发布后）：

- headless 环境：`dsh plugin --profile <name> add __PACKAGE_NAME__`（官方 reconcile 登记名单）
- desktop 应用：Plugin Manager 里直接装
- 或统一一条命令：`pnpm profile:add --npm`（同下，多一层自检）

**想改**（本地源码态）：

```sh
pnpm profile:add          # link: 本仓装进 ~/.dsh/profiles/desktop；缺依赖自动 install、装前自动构建
pnpm profile:add --remove # 反向卸载（含名单清理）
```

脚本依次做：缺依赖先 `pnpm install`；构建本包（lib/ 不入库，link: 安装不触发 pnpm
lifecycle）；`pnpm add <spec> --dir <profile>`；把包名幂等追加进 profile
`package.json` 的 `dsh.profile.bundles`（DSH 只认这份名单，裸 `pnpm add` 不登记 =
插件静默不挂载）并钉 packageManager；realpath 自检 manifest 带 `dsh.bundle`、包名
一致、入口产物存在。装完**重启实例一次**生效。

> npm 首发前先用「想改」的 link 态。
> 手动等价：`pnpm add <spec> --dir <profile>` 后，把 `__PACKAGE_NAME__` 补进
> profile `package.json` 的 `dsh.profile.bundles` 数组。

## 开发

```sh
pnpm install
pnpm dev           # watch 构建：保存即重建 lib/
<!--#if host-->pnpm dev:hmr       # host 半边热重载接线（见下）
<!--#endif-->pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm build         # 单次构建
```

<!--#if host-->
- **pnpm dev:hmr**：把本包 `lib/` 注册进本机 home patch（`$DSH_HOME/cordis.patch.yml`）
  的 hmr watch 根。**注册后需重启实例一次**，之后的 host 半边改动随 `pnpm dev`
  重建即时热重载（免重启、PID 不变）。`--remove` 注销注册。
<!--#endif-->
<!--#if client-->
- **client 半边免接线**：DSH 的 client-hmr 自动盯着 `lib/client.js`，重建即热替换，
  不需要（也不应该）把它加进 hmr root。
<!--#endif-->

## 发布

```sh
pnpm publish   # prepare 自动构建 lib/ 再打包；scoped 包已配 access=public
```

发布前检查：`locale/*.json` 的 `meta.title` / `meta.description` 换成真实文案、
`icon.svg` 换成原创图形（Plugin Manager 与 Settings 会展示它们）。

## 结构

```
src/index.ts        宿主半边入口（apply + inject + Config）
<!--#if host-->src/config.ts       配置 schema（schemastery，peer 共享宿主实例）
<!--#endif--><!--#if client-->src/client/index.tsx 浏览器半边入口（槽位注册，React）
<!--#endif-->cordis.patch.yml    自挂载 bundle patch
locale/*.json       展示元数据（meta.title / meta.description）
icon.svg            插件图标（≤ 256 KiB）
tests/              bundle 形态守卫 / client 边界护栏 / 自身用例
scripts/lib/manifest-deps.mjs  依赖策略单一来源（不变式 I1/I2，tsdown 配置引用）
```

## 依赖纪律（不变式，改动前必读）

名单只写在 `package.json` 一处，`tsdown.config.ts` 从它派生：

- `peerDependencies`（schemastery 等）＝宿主供给同一实例 → 构建外置；
- `dependencies` ＝插件自带 → 构建内联；
- `devDependencies` ＝只许 `import type`（类型源，dev 精确钉版本）。

<!--#if client|client-->
client 半边的模块表请求（react 系）由宿主渲染进程供给，清单在 `tsdown.config.ts`
的 `EXTERNALS`，**不能**从 manifest 派生（那是宿主契约不是依赖声明）。
<!--#endif-->

## 后续要加插件 / 升级成 full？

本仓是单包布局；追加第二个插件或长出 typert 双端时，用脚手架对既有仓重排
（profile 里的旧 link 安装会自动迁移）：

```sh
npx @dreamariner/create-dsh-plugin add <包名> --type host|client|full --dir <本仓路径>
```
