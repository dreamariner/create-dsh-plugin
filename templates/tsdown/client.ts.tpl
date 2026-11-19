import host from './tsdown.host.config.ts'
import client from './tsdown.client.config.ts'

// 组合配置：给 `pnpm dev`（watch 两段）用。
//
// 两段互不依赖（client 段不内联 host 段产物），并行跑安全；但**交付构建走
// package.json 里按序的两条命令**（host 段先、client 段后），产物更确定。
export default [host, client]
