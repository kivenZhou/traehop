/**
 * 将本仓库 release/ 下的安装包发布到 GitHub Releases。
 * 需要已安装并登录 gh CLI：brew install gh && gh auth login
 *
 * 用法：npm run dist:all && npm run publish:release
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const releaseDir = join(root, 'release')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const repo = 'kivenZhou/traehop'
const tag = `v${version}`

const DOWNLOAD_FILES = {
  win: `TraeHop-${version}-win-x64.exe`,
  macArm: `TraeHop-${version}-mac-arm64.dmg`,
  macX64: `TraeHop-${version}-mac-x64.dmg`,
}

const assets = []

for (const filename of Object.values(DOWNLOAD_FILES)) {
  const path = join(releaseDir, filename)
  if (!existsSync(path)) {
    console.error(`缺少 ${path}\n请先执行: npm run dist:all`)
    process.exit(1)
  }
  assets.push(path)
  console.log(`found ${filename}`)
}

function runGh(args) {
  const result = spawnSync('gh', args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`\nPublishing to https://github.com/${repo}/releases/tag/${tag}\n`)

const createArgs = [
  'release', 'create', tag,
  ...assets,
  '--repo', repo,
  '--title', `TraeHop ${version}`,
  '--notes', `TraeHop ${version} installers`,
]

const createResult = spawnSync('gh', createArgs, { stdio: 'inherit' })
if (createResult.status !== 0) {
  console.log('\nRelease 可能已存在，尝试上传资源…')
  for (const file of assets) {
    runGh(['release', 'upload', tag, file, '--repo', repo, '--clobber'])
  }
}

console.log('\nDone. Download URLs:')
for (const name of Object.values(DOWNLOAD_FILES)) {
  console.log(`  https://github.com/${repo}/releases/download/${tag}/${name}`)
}
