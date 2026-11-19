import { defineConfig } from 'tsdown'

// client 段构建（tsdown.client.config.ts）：src/client/index.tsx → lib/client.js
// （CJS + __ModuleLoader__ 包装，宿主渲染进程经 dsh.client 声明自动发现并装载）。
//
// ⚠ 构建顺序：host 段（tsdown.host.config.ts）先、client 段后（build 脚本按序跑两条
//   命令）。本段不内联 host 段产物（client 半边与宿主壳互不依赖），但按序跑能保证
//   交付产物确定；`tsdown.config.ts`（两段并行）只给 `pnpm dev` 的 watch 用。
//
// EXTERNALS 是宿主契约（渲染进程模块表供给，绝不打包）；清单外的裸 import 一律内联，
// onlyImport 让清单外的裸 import 在构建期直接报错。
// ⚠ 官方 practices：不要 require 任何 @deepseek-ai/dsh-client-* 包 : 控件照宿主的
//   样子自己写，样式只引用 --dsw-alias-* 主题 token。
// ⚠ 不要把本包自己的子路径放进 EXTERNALS（不在浏览器模块表里，外置即
//   `missed the module table` → web boot: 1 entry did not activate）。
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

export default defineConfig({
  entry: ['src/client/index.tsx'],
  outDir: 'lib',
  clean: false,
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: EXTERNALS,
    alwaysBundle: (specifier: string) => !EXTERNALS.includes(specifier),
    onlyImport: EXTERNALS,
  },
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
  },
  // : 包装，与 DSH 运行时期望的字节形态一致 :
  // ⚠ CJS 格式下 rolldown 会跳过独立的 intro（产物缺 var exports = module.exports
  //   → 浏览器 exports is not defined），故 intro 并进 banner。
  banner: [
    `window.__ModuleLoader__.load({ id: '__PACKAGE_NAME__', factory: (require) => {`,
    'var module = { exports: {} };',
    'var exports = module.exports;',
  ].join('\n'),
  footer: 'return module.exports; } });',
})
