// `npm run package`: zips dist/ (including the hidden .htaccess) into one file for MilesWeb.
// Upload the zip in cPanel File Manager and use Extract, so no file is left behind.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const zip = join(root, 'clickmart-storefront.zip')

for (const file of ['.htaccess', 'index.html', 'spa.html', 'sitemap.xml', 'robots.txt']) {
  if (!existsSync(join(dist, file))) {
    console.error(`package: dist/${file} is missing. Run npm run build first and check it finished.`)
    process.exit(1)
  }
}
rmSync(zip, { force: true })
execFileSync('zip', ['-qr', '-X', zip, '.', '-x', '*.DS_Store'], { cwd: dist, stdio: 'inherit' })
console.log(`package: ${zip} (${Math.round(statSync(zip).size / 1024)} KB). Upload it to public_html and Extract (it includes .htaccess).`)
