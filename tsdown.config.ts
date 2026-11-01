import { defineConfig } from 'tsdown'

// 脚手架自身：打包成**单文件 bin**（lib/index.js）。
// noExternal 全量内联：npx / pnpm dlx 场景下产物零裸 import，依赖漂移不可能发生；
// 入口首行的 shebang 由 tsdown 保留并授予执行位（实测 0.22）。
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  dts: false,
  noExternal: [/./],
})
