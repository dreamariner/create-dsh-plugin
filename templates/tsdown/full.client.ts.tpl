import { defineConfig } from 'tsdown'

// client 段构建（tsdown.client.config.ts）：src/client/index.tsx → lib/client.js
// （CJS + __ModuleLoader__ 包装，宿主渲染进程经 dsh.client 声明自动发现并装载）。
//
// ⚠ 必须在 host 段（tsdown.host.config.ts）之后跑：本段把 host 段刚生成的
//   lib/typert.remote-client.js 内联进 bundle（自有子路径不在浏览器模块表里，不能外置；
//   反过来从 src/remote.ts 值导入会把 typert-protocol 的值依赖拖进浏览器 bundle →
//   web boot: 1 entry did not activate）。顺序反了会内联上一轮的旧契约。
//
// EXTERNALS 是宿主契约（渲染进程模块表供给，绝不打包）；清单外的裸 import 一律内联，
// onlyImport 让清单外的裸 import 在构建期直接报错。
// ⚠ 官方 practices：不要 require 任何 @deepseek-ai/dsh-client-* 包 : 控件照宿主的
//   样子自己写，样式只引用 --dsw-alias-* 主题 token。
// ⚠ 不要把本包自己的子路径放进 EXTERNALS（不在浏览器模块表里，外置即
//   `missed the module table` → web boot: 1 entry did not activate）。
// ⚠ typert 协议包（@deepseek-ai/dsh-typert-protocol）与 zod 在 client 半边**有意内联**，
//   勿加进 EXTERNALS：渲染进程模块表种子（DSH packages/client/web/src/platform.ts 的
//   PLATFORM_MODULES）没有协议包，协议包也无 client 模块行，dsh.client.external 请求
//   只能落到种子或别的 client 模块行，没有供给方，外置必 `missed the module table`；
//   DSH 构建门（packages/client/tsdown.client.ts 的 INLINE_SAFE / GENERATED_REMOTE）
//   明示这两层 no runtime identity to share 可内联。内联的是 npm 发布副本（devDep 裸
//   精确 pin）；vendor submodule 只进生成器 face program（tsconfig.host.json paths，
//   构建期 codegen），不进任何 bundle。
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
