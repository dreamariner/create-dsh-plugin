packages:
  # typert 协议声明源（git submodule：dreamariner/dsh-typert-protocol，挂 packages/protocol）。
  # 收进 workspace 后它的 devDeps 才会被安装，生成器的 workspace registration
  # 也按 <root>/packages/ 识别它（生成器结构性要求，不可挪到别的路径）。
  - packages/*
