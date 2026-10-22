// `npm run package`: zips dist/ (including the hidden .htaccess) into one file for MilesWeb.
// Upload the zip in cPanel File Manager to the admin subdomain's folder and use Extract.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const zip = join(root, 'clickmart-admin.zip')

for (const file of ['.htaccess', 'index.html']) {
  if (!existsSync(join(dist, file))) {
    console.error(`package: dist/${file} is missing. Run npm run build first and check it finished.`)
    process.exit(1)
  }
}
rmSync(zip, { force: true })
execFileSync('zip', ['-qr', '-X', zip, '.', '-x', '*.DS_Store'], { cwd: dist, stdio: 'inherit' })
console.log(`package: ${zip} (${Math.round(statSync(zip).size / 1024)} KB). Upload it to the admin site's folder and Extract (it includes .htaccess).`)
