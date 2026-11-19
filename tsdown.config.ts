import { defineConfig } from 'tsdown'

// 脚手架自身：打包成**单文件 bin**（lib/index.js）。
// deps.alwaysBundle 全量内联：npx / pnpm dlx 场景下产物零裸 import，依赖漂移不可能发生；
// 入口首行的 shebang 由 tsdown 保留并授予执行位（实测 0.22）。
// ⚠ 不用 noExternal（已废弃 API，tsdown 0.22 起构建时打 WARN，且未来大版本会移除）。
//   alwaysBundle 收的是「模式数组」，不是布尔：写 true 会在 picomatch 里炸
//   （Expected pattern to be a non-empty string）。[/./] = 全量内联的等价写法。
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  dts: false,
  deps: { alwaysBundle: [/./] },
})
