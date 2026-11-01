node_modules/
*.log
npm-debug.log*

# 环境变量（机器本地配置；机密只进 ~/.dsh/.env）
.env
.env.*
!.env.example

# 依赖与构建缓存
.vite/
*.tsbuildinfo

# 发布时由 prepublishOnly 从仓根同步进包目录（真源在仓根，防双真源漂移）
packages/*/README.md
packages/*/LICENSE

# 系统文件
.DS_Store
