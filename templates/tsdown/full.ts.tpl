import host from './tsdown.host.config.ts'
import client from './tsdown.client.config.ts'

// 组合配置：给 `pnpm dev`（watch 两段）用。
//
// ⚠ 交付用的 build 不走这里，走 package.json 里按序的两条命令
//   （tsdown --config tsdown.host.config.ts && tsdown --config tsdown.client.config.ts）：
//   这个文件里的两段是并行跑的，client 会内联上一轮的旧契约。改动 remote.ts 后
//   要拿确定的产物，请跑 build 脚本，不要只跑 dev。
export default [host, client]
