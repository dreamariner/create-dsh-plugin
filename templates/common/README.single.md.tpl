# __PACKAGE_NAME__

__DESCRIPTION__（由 create-dsh-plugin 生成的 DeepSeek Harness 插件，形态：**__PLUGIN_TYPE_LABEL__**）。

本仓是**单包布局**：根即插件包，`pnpm publish` / `dsh plugin add` / git 安装都以本仓为单位。

## 安装

**方式一（推荐）：CLI 一条命令 = 装包 + 登记 bundle 名单，一步到位**

```sh
dsh plugin --profile <name> add __PACKAGE_NAME__        # npm（发布后）
dsh plugin --profile <name> add github:<owner>/<repo>   # 未发布：git 直装（单包仓支持）
```

**方式二：手动 pnpm 装**（desktop profile 不接受 CLI 的 pnpm 转发时）

⚠ 裸 `pnpm add` 只完成「装包」：DSH 的 profile 只认 `dsh.profile.bundles` 名单
（loadProfileDirectory 不扫 dependencies），装完**必须把包名补进 profile
`package.json` 的 `dsh.profile.bundles`**，插件才会挂载。

```sh
pnpm add __PACKAGE_NAME__ --dir <profile目录>   # npm（发布后）
pnpm add link:<本仓路径> --dir <profile目录>     # 本地开发态（单包仓：link 仓根即可）
pnpm add github:<owner>/<repo> --dir <profile目录>

# ② 登记：把 "__PACKAGE_NAME__" 加进 profile package.json 的 dsh.profile.bundles 数组
```

> git 安装且 pnpm ≥ 10 时，需在 profile 的 `pnpm-workspace.yaml` 放行构建脚本
> （`allowBuilds: { "__PACKAGE_NAME__": true }`，pnpm 10 的键名是
> `onlyBuiltDependencies`；lib/ 已随仓提交，放行前也能装上，放行是为了 prepare
> 能重建到最新源码）。desktop profile 也可以用 app 内 Plugin Manager（两步齐全）。

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
