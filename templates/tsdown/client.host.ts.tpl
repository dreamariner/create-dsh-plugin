import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'
// 项目共用脚本住根 scripts/（一仓一份，add 插件不复制）
import { hostDeps, readManifest } from '__MANIFEST_DEPS_REL__'

// host 段构建（tsdown.host.config.ts）：src/index.ts → lib/index.js（ESM，宿主进程装载）。
//
// client 形态的宿主半边是**空 apply 壳**（官方 decoration 形态同款：渲染与交互全在
// 浏览器半边，宿主只需要「插件存在」）。但它必须真的被构建出来：
//   · manifest 的 main / exports['.'] 都指向 lib/index.js，bundle patch 里的插件行
//     靠这个入口解析；
//   · 装载断链的后果是**静默**的：cordis loader 吞异常，表现只是「插件不见了」。
// 官方 decoration 模板同样同时发布 index.js（宿主壳）与 client.js（浏览器半边）。
//
// ⚠ 构建顺序：host 段先、client 段后（build 脚本按序跑两条命令）。本段与 client 段
//   互不依赖（client 段不内联本段产物），但按序跑能保证交付产物确定。
//
// 依赖策略（不变式）：名单只写在 package.json 一处 :
//   peerDependencies → 外置（宿主拦截层供给同一实例）；
//   dependencies → 内联；devDependencies → 只许 import type。
const manifest = readManifest(fileURLToPath(new URL('.', import.meta.url)))

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  outDir: 'lib',
  dts: false,
  // tsdown 0.22 对 node 平台默认 fixedExtension=true（强制 .mjs）；关掉它按包内
  // type: module 出 .js，与 DSH/社区包的 lib/index.js 形态一致。
  fixedExtension: false,
  // clean: false : host 与 client 共用 lib/，构建失败不能毁掉上一份产物
  clean: false,
  deps: hostDeps(manifest),
})
