// create-dsh-plugin :: author / homepage / repository 三字段取值
//
// 为什么：官方 plugin-market-generator 收录 npm 包时读这三个展示字段且无兜底
// （homepage 只认 manifest homepage，repository 只认 manifest repository，
// author 只认 manifest author），缺失则 Discover 卡片对应项空白。
//
// 为什么先归一化再写入：生成器对已知 host 走 hosted-git-info，未知 host（自建
// git 服务等）只认 http(s) URL 且剥 git+ / 凭据 / .git；scp 形式 git@host:path 对
// 未知 host 解析不了。这里统一转成 https 网页 URL，生成器两条路都吃。
//
// 来源优先级（拿不到就省略，manifest 不写空值）：
//   repository = --repository flag > git origin remote（仅当目标 = 仓库顶层）
//              > 包名 scope 推导 github.com/<scope>/<id>
//   homepage   = --homepage flag > 已解析的 repository URL
//   author     = --author flag > git config user.name

import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pluginIdOf } from './args.ts'

export interface RepoFieldsInput {
  packageName: string
  targetDir: string
  author?: string
  homepage?: string
  repository?: string
}

/** 解析结果：三字段都可能是 undefined（= manifest 省略该键）。 */
export interface RepoFields {
  author?: string
  homepage?: string
  repository?: string
}

/** 读取器（resolveRepoFields 注入点，测试用假实现替身）。 */
export interface RepoReaders {
  readOriginUrl: (dir: string) => string | undefined
  readGitAuthor: () => string | undefined
}

function spawnOut(args: string[], cwd?: string): string | undefined {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) return undefined
  const out = (r.stdout ?? '').trim()
  return out === '' ? undefined : out
}

/** 目标目录自身的 origin remote；仅当目标就是 git 仓库顶层时才认。目标是外层仓的
 *  子目录时（如在别的仓里生成），origin 属于外层项目，与本仓无关，返回 undefined。
 *  不在 git 仓里 / git 不可用同样返回 undefined。 */
export function readOriginUrl(dir: string): string | undefined {
  const top = spawnOut(['rev-parse', '--show-toplevel'], dir)
  if (top === undefined) return undefined
  try {
    if (realpathSync(top) !== realpathSync(dir)) return undefined
  } catch {
    return undefined
  }
  return spawnOut(['remote', 'get-url', 'origin'], dir)
}

/** git config user.name（本地覆盖优先，git 自动解析）；无配置返回 undefined。 */
export function readGitAuthor(): string | undefined {
  return spawnOut(['config', 'user.name'])
}

/** 任意 git URL / shorthand → https 网页 URL。支持 https(s)://、git+ 前缀、
 *  ssh://、scp 形式 git@host:path、github:owner/repo；剥 #committish、凭据、
 *  query、尾部 .git。解析不出含两段路径的 http(s) 页面 → undefined。 */
export function normalizeRepoUrl(raw: string): string | undefined {
  let url = raw.trim()
  if (url === '') return undefined
  url = url.replace(/^git\+/u, '').replace(/#.*$/u, '')
  const scp = /^git@([^:/]+):(.+)$/u.exec(url)
  if (scp !== null) {
    url = `https://${scp[1]}/${scp[2]!}`
  } else {
    const ssh = /^ssh:\/\/(?:[^/@]+@)?([^/]+)\/(.+)$/u.exec(url)
    if (ssh !== null) url = `https://${ssh[1]}/${ssh[2]!}`
    else {
      const gh = /^github:\/?(.+)$/u.exec(url)
      if (gh !== null) url = `https://github.com/${gh[1]!}`
    }
  }
  if (!URL.canParse(url)) return undefined
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined
  u.username = ''
  u.password = ''
  u.search = ''
  u.hash = ''
  u.pathname = u.pathname.replace(/\.git\/?$/u, '').replace(/\/+$/u, '')
  if (u.pathname.split('/').filter((s) => s !== '').length < 2) return undefined
  return u.href
}

/** 包名 scope 推导：@scope/name → https://github.com/scope/name（公开面默认
 *  GitHub；非 GitHub 托管的仓用 --repository 显式给）。无 scope → undefined。 */
export function repoFromScope(packageName: string): string | undefined {
  if (!packageName.startsWith('@')) return undefined
  const slash = packageName.indexOf('/')
  if (slash <= 1) return undefined
  return `https://github.com/${packageName.slice(1, slash)}/${pluginIdOf(packageName)}`
}

/** 按优先级链解析三字段。flag 是明确意图：--repository / --homepage 解析失败
 *  直接报错（渲染开始前暴露），不静默省略。 */
export function resolveRepoFields(input: RepoFieldsInput, readers: RepoReaders = { readOriginUrl, readGitAuthor }): RepoFields {
  let repository: string | undefined
  if (input.repository !== undefined) {
    const normalized = normalizeRepoUrl(input.repository)
    if (normalized === undefined) {
      throw new Error(`--repository 无法归一化为 https 仓库页（支持 https URL、git URL、git@host:path、github:o/r）：${input.repository}`)
    }
    repository = normalized
  } else {
    const origin = readers.readOriginUrl(input.targetDir)
    // origin 读到了但解析不了：仓已托管在别处，scope 推导的 github 地址多半是错的，
    // 宁缺毋滥；origin 根本没有（全新目录）才走 scope 推导
    repository = origin !== undefined ? normalizeRepoUrl(origin) : repoFromScope(input.packageName)
  }

  let homepage: string | undefined
  if (input.homepage !== undefined) {
    const trimmed = input.homepage.trim()
    if (!URL.canParse(trimmed) || !['https:', 'http:'].includes(new URL(trimmed).protocol)) {
      throw new Error(`--homepage 需要绝对 http(s) URL：${input.homepage}`)
    }
    homepage = trimmed
  } else {
    homepage = repository
  }

  const flagAuthor = input.author?.trim()
  const author = flagAuthor !== undefined && flagAuthor !== '' ? flagAuthor : readers.readGitAuthor()

  const out: RepoFields = {}
  if (author !== undefined && author !== '') out.author = author
  if (homepage !== undefined) out.homepage = homepage
  if (repository !== undefined) out.repository = repository
  return out
}
