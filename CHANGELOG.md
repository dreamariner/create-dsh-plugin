# 变更日志（Changelog）

本仓所有显著变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（0.x 阶段 minor 允许破坏性变更）。

## [0.5.0] - 2026-11-19

> 本版是自 0.3.2（npm 上最后一个发布版）之后的第一个发布版。0.4.0 / 0.4.1 / 0.4.2
> 只存在于 git，从未发布到 npm，其内容并入本版。

### 新增

- **DSH 实例管理上浮为标准能力**（原 0.4.0）：`dsh-ctl.mjs` 升级为「机制 + 门 + 可测试
  导出面」三合一：isMain 双形态（护栏测试可 import）、仓根 `.env` 自动加载（真实环境变量
  优先，.env 只补缺）、版本门（根 manifest 的 `dshVersion` 对账官方打包版
  `CFBundleShortVersionString`，不符拒启，`DSH_ALLOW_VERSION_MISMATCH=1` 越过）、
  在飞回合守卫（`DSH_INFLIGHT_GUARD=1`，stop / restart 前扫 2 小时内活跃会话）、
  `status --json` 与 `record` 子命令。根 manifest 发射 `dshVersion` 字段作为对账源
- **full 形态构建拆 host / client 两段按序跑**（原 0.4.2）：生成结构从单
  `tsdown.config.ts` 变为三份（`tsdown.host.config.ts` / `tsdown.client.config.ts` /
  `tsdown.config.ts` 只作 dev watch 组合），插件包 build 与 prepare 按序跑两段。
  原因：client 产物要内联 host 段**当轮**生成的 `lib/typert.remote-client.js`，并行跑会
  内联上一轮的旧 wire 契约（fresh clone 时甚至解析不到该文件）。host / client 形态不变

### 修正

- **协议包两半边口径定案**（原 0.4.1）：删掉 full 形态 README 里「client 侧要把
  `@deepseek-ai/dsh-typert-protocol` 加进 `EXTERNALS`」的错误指引（渲染进程模块表种子
  没有协议包，外置后 client 的 require 会 `missed the module table`，插件 client 静默
  失效）。正确口径：host 外置 / client 内联，且内联的是 npm 发布副本而非 vendor
  submodule。依据沉淀进 README、生成项目 AGENTS.md 模板、SKILL.md 与 tsdown 模板注释
- **add 模式的仓根路径显示为空**：`displayPath` 在目标目录 = cwd 时返回空串，输出里出现
  「（仓根：）」与一条空掉的 `cd` 指令（add 缺省目标就是 cwd）。改为返回 `.`，前缀判断
  收紧到目录分隔符（免得 `/tmp/cwd-2` 这类同前缀兄弟目录被误判成子目录）
- **协议声明源补挂指引用错 URL**：挂载失败时打印的手动命令写死内置默认 URL，用户传了
  `--protocol-url` 时被忽略（挂错声明源 = 生成器编出错的 wire 契约）。改为回显实际用的 URL
- **submodule 可能挂到外层仓**：目标目录落在别的 git 仓内时（本仓被跳过 git init），
  `git submodule add` 会把声明源指针登记到**外层仓**。挂载前检测并明确告警
- **生成项目里的构建配置名过期**：full 生成项目的源码注释仍指向旧的单配置
  `tsdown.config.ts`（codegen 实际在 `tsdown.host.config.ts`、client 产物在
  `tsdown.client.config.ts`）。按形态给准
- **单包 README 模板条件块笔误**：`<!--#if client|client-->`（等价于 client）改回
  `<!--#if client-->`
- **`--help` 的 create 说明停留在布局分家之前**：仍说一律 workspace，改为按形态说明
  （host / client 单包，full 是 workspace）
- **仓 README 的发布钩子名过期**：`prepublishOnly` 改为实际的 `prepare`
- **node 版本口径矛盾（三处）**：脚手架与 SKILL 都说 node ≥ 20，但①实例管理命令
  （`pnpm dsh:*`）走主进程 inspector 通道、用全局 `WebSocket`（node 20 没有），node 20
  上会直接报「需 node ≥ 22」；②生成项目要跟 DSH 宿主对齐：DSH 官方
  `engines.node: >=24.9.0`（`docs/development.md` 同；自 0.2.1-rc.2 起不再支持 Node 22），
  插件作者要在本机跑 DSH 验插件 → 实际门槛是 24.9；而生成项目自带的 vitest 5 / tsdown
  0.22 本身只要 22.18（被 24.9 盖住）。口径改成分三层写清：生成项目开发环境 ≥ 24.9
  （对齐 DSH 宿主）；跑已发布的包本体 ≥ 20；实例管理命令 ≥ 22（被 24.9 盖住）
  （SKILL 前置条件、脚手架 README、生成项目 README 与 AGENTS.md 模板同步）
- **占位符名单三处各写一份**：替换正则、`substitutionsOf` 的键、测试的残留断言各有一份
  手写名单。加占位符时若漏改替换正则，`__X__` 会原样留在生成文件里，而测试的残留断言
  用的也是另一份名单、同样不含它 → 两条防线同时漏，坏东西静默出厂。改为抽一份常量
  `PLACEHOLDERS`（替换正则与测试都从它派生），并把残留断言换成通用形状扫描
  （只放行 DSH 的 `__ModuleLoader__`），名单外的漏网占位符也抓得到
- **跨形态重排会覆盖用户的代码，旧布局的目录还留在仓根**：`create --dir` 指向非空仓 =
  跨形态重排。此前①渲染阶段直接拿模板盖掉用户已有的 src/ tests/ locale/ icon.svg
  （用户写的逻辑被冲掉）；②重排后旧布局的路径（src/ tests/ locale/ icon.svg
  cordis.patch.yml tsdown.config.ts lib/）一直躺在仓根，两套布局叠在一起，仓根那个旧
  tsdown.config.ts 还是个隐患。改为三条纪律：①重排模式下用户可编辑的内容面**不覆盖**
  （模板只补缺失的）；②旧布局的插件内容**搬进**新布局的插件包（用户版占位；与新形态
  模板同名的文件，模板版备份成 `<文件>.template`，两边都留）；③搬完删掉旧路径，仓根只剩
  新布局的结构。workspace → single 方向若 packages/ 里还有别的插件包则**不清理**（不替你
  决定删哪个）并给出告警。护栏侧：typert 面安装态护栏的报错文案区分「忘了 build」与
  「src/index.ts 没 re-export Remote」（重排后旧代码覆盖模板版最容易撞后者）
- **client 形态的宿主半边从来没被构建（client 插件装不进 profile）**：manifest 的 `main` /
  `exports['.']` 都指向 `./lib/index.js`，但 client 形态只构建 `lib/client.js` →
  `src/index.ts` 那个空 apply 宿主壳是**死代码**，产物根本不存在。后果：①
  `pnpm profile:add` 的产物自检直接失败（「入口产物缺失：.../lib/index.js」）→ client
  插件**装不进任何 profile**；②发布到 npm 的包入口指向不存在的文件，bundle patch 的
  插件行解析不到 → 装载断链（插件静默不出现）。官方 decoration 模板同时发布 index.js
  （宿主壳）与 client.js（浏览器半边），本仓与它对齐：client 形态也拆两段构建
  （`tsdown.host.config.ts` 出 `lib/index.js`，`tsdown.client.config.ts` 出
  `lib/client.js`，`tsdown.config.ts` 只给 `pnpm dev` 的 watch），build 与 prepare 按序
  跑两段，`src/index.ts` 不再是死代码。三形态的配置结构就此统一：host 单配置，
  client / full 双段 + 组合
- **node 20.0–20.10 上脚手架自身会崩**：模板定位用了 `import.meta.dirname`（node ≥ 20.11
  才有，engines 声明的却是 >=20），`add(full)` 追加到还没有 `tsconfig.host.json` 的仓时
  取路径直接抛 TypeError。改为用 `import.meta.url` 定位模板目录（与渲染层共用同一份
  路径解析），engines 维持 `>=20`
- **脚手架自身的构建用了已废弃的 tsdown API**：`noExternal` 自 tsdown 0.22 起打 WARN、
  未来大版本会移除。改为 `deps.alwaysBundle`（语义等价：全量内联，产物零裸 import）

### 变更

- DSH 版本锚 `0.2.2-rc.2` → `0.2.2-rc.5`（`src/manifest.ts` 的 `DSH_VERSION`）：生成物
  peer 范围、`engines.dsh`、typert 生成器 / 协议包 dev 精确钉随动；schemastery 3.19.0 /
  cordis 4.1.0 不变
- SKILL.md 的行为版本口径同步（0.4.x 未发布，行为版本按 0.5.0 记）

## [0.4.2] - 2026-11-18

> 此版本未发布到 npm（只存在于 git），其内容随 0.5.0 一起交付。

### 修正

- full 形态构建拆成 host / client 两段按序跑。此前模板是单一 `tsdown.config.ts` 数组
  配置，两段并行：client 产物要内联 host 段**当轮**生成的 `lib/typert.remote-client.js`
  （typertPlugin 在 host 段构建时生成 wire 契约），并行跑会让 client 内联上一轮的旧
  契约（`src/remote.ts` 方法增删后客户端与宿主对不上），fresh clone 时甚至解析不到该文件
- 生成结构变化：full 插件包从单 `tsdown.config.ts` 变为三份
  （`tsdown.host.config.ts` / `tsdown.client.config.ts` / `tsdown.config.ts` 仅作 dev
  watch 组合，两段并行，交付构建勿用）；插件包 build 与 prepare 按序跑两段
  （prepare = `pnpm run build && node ../../scripts/sync-pack-docs.mjs`）。host / client
  形态不变（仍单配置），add 追加插件按形态取用
- 文档同步：README（开发说明 / 结构树 / 依赖纪律 / typert 构建接线）、生成项目 AGENTS.md
  模板（红线新增「构建顺序：host 段先、client 段后」，协议包口径的引用改指
  `tsdown.client.config.ts`）、SKILL.md（构建顺序 + 存量仓拆分指引）。实测参照：
  dsh-notify 已按此形态运行（2026-11-17 清空 lib/ 从零构建验证过）

## [0.4.1] - 2026-11-18

> 此版本未发布到 npm（只存在于 git），其内容随 0.5.0 一起交付。

### 修正

- 删除 full 形态 README「client 侧消费」里「把 `@deepseek-ai/dsh-typert-protocol` 加进
  client 段 `EXTERNALS`」的错误指引：渲染进程模块表种子（DSH `packages/client/web/src/
  platform.ts` 的 `PLATFORM_MODULES`）没有协议包，协议包也无 client 模块行，
  `dsh.client.external` 请求只能落到种子或别的 client 模块行，外置后 client 的 require
  会 `missed the module table`（插件 client 静默失效）。「内联解析不到」的预期也被协议包
  devDep 裸精确 pin 掩盖（构建期解析得到，静默内联成功）
- 正确口径沉淀进四处，生成的项目开箱自带依据：README（协议包两半边不对称：host 外置 /
  client 内联，内联的是 npm 发布副本而非 vendor submodule）、生成项目 AGENTS.md 模板
  （形态速记新增一条 + typert 纪律红线补 client 半边口径）、SKILL.md（typert 纪律）、
  `tsdown/full.ts.tpl` client 段注释。依据：DSH `packages/client/tsdown.client.ts` 的
  `INLINE_SAFE` / `GENERATED_REMOTE`（no runtime identity to share）与官方 client 装配
  `api/remotes/src/client` 的实践；实证：dsh-notify / dsh-ledger / dsh-pilot /
  luna-dsh-memory 四个 full 插件 client 产物逐一同构（协议包与 zod 内联、react 外置、
  自挂载）

## [0.4.0] - 2026-11-16

> 此版本未发布到 npm（只存在于 git），其内容随 0.5.0 一起交付。

### 新增

- `dsh-ctl.mjs` 实例管理升级为「机制 + 门 + 可测试导出面」三合一（机制借自早期插件仓
  instance-control 的实测经验，随实例控制统一上浮为标准能力）：
  - **导出化**：isMain 双形态，护栏测试可 `import { status, stop, probe, … }`
  - **仓根 .env 自动加载**：真实环境变量优先、.env 只补缺、缺失静默 no-op（内联实现，
    不新增模板文件）；机密仍只进 `~/.dsh/.env`，仓根 .env 只放路径/端口/形态/开关
  - **版本门**：根 manifest 有 `dshVersion` 字段时，启动前对账官方打包版
    `CFBundleShortVersionString`，不符拒启（`DSH_ALLOW_VERSION_MISMATCH=1` 越过）；
    字段缺失 = 门不启用，存量仓零影响
  - **在飞回合守卫**：`DSH_INFLIGHT_GUARD=1` 开启后，stop/restart 前扫 `$DSH_HOME/sessions`
    下 2 小时内活跃会话（session.v*.jsonl 取最大版本判读），turn/start 无配对 turn/end
    即拦下（`DSH_FORCE_STOP=1` 越过）
  - `status --json`（供 automation）与 `record` 子命令（wrapper 型启动脚本注入状态）
- 根 manifest 发射 `dshVersion` 字段（= DSH 版本锚，版本门的对账源；single 布局落包 manifest）

## [0.3.2] - 2026-11-13

### 变更

- DSH 版本锚 `0.2.2-rc.1` → `0.2.2-rc.2`（`src/manifest.ts` 的 `DSH_VERSION`）：生成物 peer 范围、
  typert-generator / typert-protocol dev 精确钉同步。vendor 数值不变（cordis 4.1.0、schemastery 3.19.0）
- full 形态生成物 `files` 增加 `lib/typert.remote-client.d.ts.map`：DSH 0.2.2-rc.2 的 typert 生成器
  硬性要求 remote-client 的 declaration map 入列（生成的 d.ts 带 sourceMappingURL，map 随包发行），
  缺它构建期直接报「package files must include lib/typert.remote-client.d.ts.map」
- full 形态生成物 dependencies 的 zod `^4.4.3` → `^4.6.6`：上游协议包 0.2.2-rc.2 起精确 pin zod 4.6.6

## [0.3.1] - 2026-11-12

> 此版本未发布到 npm（只存在于 git），其内容随 0.3.2 一起交付。

### 变更

- 依赖锚同步宿主实况：schemastery `3.18.5` → `3.19.0`（peer 范围 `>=3.19.0 <4.0.0-0` + dev 精确钉）、
  cordis dev 精确钉 `4.0.5` → `4.1.0`。依据：DSH `0.2.2-rc.1` 的 vendor 版本
  （deepseek-harness `vendor/cordis` 4.1.0、`vendor/schemastery` 3.19.0），与同代外部插件仓的实钉一致。
  宿主对这二者从不降级，生成物 peer 收窄到 `3.19.0` 起不会排除任何在跑的宿主

## [0.3.0] - 2026-11-08

### 新增

- 生成物的插件 manifest 按需写入 `author` / `homepage` / `repository` 三个市场展示字段（官方
  plugin-market-generator 收录时读取且无兜底，缺失则 Discover 卡片留白）。来源链：
  显式 flag > git origin remote（仅当目标 = 仓库顶层）> 包名 scope 推 github 地址；都没有则省略
- 新增 `--author` / `--homepage` / `--repository` 三个参数；取值与归一化逻辑住新模块 `src/repo.ts`
  （读取器注入，可测）。URL 一律先归一化成 https 网页 URL（官方生成器解析不了未知 host 的 scp 形式）；
  `homepage` 缺省跟随 `repository`；`author` 缺省取 git config user.name
- workspace 布局自动带 `repository.directory = packages/<id>`；add 路径恒带

### 修复

- 发版审计①：`import-guard.spec.ts` 模板的 `isTypeOnlyBinding` 改用 `isNamedImports` /
  `isNamedExports` 守卫窄化（AST 联合形状随 TS 小版本变化，TS 5.9.3 下生成项目 typecheck 红）
- 发版审计②：`substitutionsOf` 显式接受布局参数（add 追加 host / client 插件时占位符误按 single
  推导：护栏 spec 找错 manifest 与源码目录、host 的 tsdown 断链 `pnpm -r build`）+3 回归测试

### 变更

- DSH 版本锚三处同步 `0.2.1-rc.3` → `0.2.2-rc.1`（README / SKILL / manifest 注释，随 0.2.0 起的实际锚值）

## [0.2.0] - 2026-11-06

> 此版本未发布到 npm（只存在于 git），其内容随 0.3.0 一起交付。

### 新增

- 生成项目自带文档机制：`docs/issues/`（需求单模板与索引）与 `docs/wiki/00-变更日志.md`
- 生成项目自带 `AGENTS.md`（Agent 进仓入口），按插件形态完整分化；条件块引擎换栈式配对（支持嵌套）
- 新增脚手架使用技能 `skills/create-dsh-plugin/SKILL.md`（形态选型判据、生成后清单、红线与坑）
- 生成项目自带 DSH 实例管理脚本 `pnpm dsh:start / dsh:restart / dsh:stop / dsh:status / dsh:probe`
- 源码导入纪律护栏：依赖决策表红线接线（`runtimeAllowed` 首个消费者），devDep 断言补 client
  模块表供给豁免

### 变更

- DSH 版本锚跟进 `0.2.2-rc.1`（peer 范围、engines、devDeps 与模板注释随动）
- 清洗仓内对具体消费项目的引用（公开仓保持通用表述）

## [0.1.1] - 2026-11-03

### 新增

- `--project-name` 参数：项目名与包名解耦（目录名 / 根壳 manifest 名跟项目名）
- 跨形态重排：`create --dir` 指向非空仓时自动迁移 profile 里的旧 `link:<仓根>` 装法
- `pnpm profile:add`：一条命令装包 + 登记 bundles 名单 + 自检（link 态装前自动构建，撤 git 直装）
- typert 面安装态护栏测试（zod 必须留在 dependencies）

### 变更

- 布局按形态分家：host / client 单包（根即插件包），full workspace（结构性要求）
- 发布面收口：生成的插件 manifest 不再携带 src 源码（`files` 与 `exports` 只含产物）
- 项目共用脚本归根（`scripts/`），dev-hmr 项目化（一仓一份）
- 文档同步钩子从 `prepublishOnly` 改挂 `prepare`（pack 与 git 安装也触发）
- 占位图标重设计为通用拼图块（透明底渐变，对齐内置插件风格）

### 修复

- `.gitignore` 锚定 lib 忽略规则（裸 `lib/` 任意深度匹配，`git add` 静默跳过 `scripts/lib/` 共享模块）
- `sync-pack-docs` 目的地硬守卫（只许 `packages/` 下，防仓根真源被覆盖）
- 发布产物补 README / LICENSE；workspace 仓的 git 安装指引修正

## [0.1.0] - 2026-11-01

### 新增

- 首发：DSH 插件脚手架，host / client / full 三形态一键创建（`npx @dreamariner/create-dsh-plugin`）
- full 形态 typert codegen 全链路：协议声明源 submodule 自动挂载 + 生成器 face 配置 + wire 契约
- 一仓多插件：三形态统一 workspace 布局 + `add` 子命令
- 根 tsconfig 收编全部插件包 tests（测试也进类型检查）
- 生成物 manifest 的 exports 补展示元数据导出面（`./locale/*.json` 与 `./icon`）

[0.5.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.3.2...0.5.0
[0.4.2]: https://github.com/dreamariner/create-dsh-plugin/compare/7282b5e...e2c3a19
[0.4.1]: https://github.com/dreamariner/create-dsh-plugin/compare/7282b5e...e2c3a19
[0.4.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.3.2...7282b5e
[0.3.2]: https://github.com/dreamariner/create-dsh-plugin/compare/0.3.0...daec4f6
[0.3.1]: https://github.com/dreamariner/create-dsh-plugin/compare/0.3.0...4db4f3a
[0.3.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/dreamariner/create-dsh-plugin/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/dreamariner/create-dsh-plugin/releases/tag/0.1.0
