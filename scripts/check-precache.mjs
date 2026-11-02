import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const sw = fs.readFileSync('dist/sw.js', 'utf8')
const assets = fs.readdirSync('dist/assets').filter(name => /\.(js|css)$/.test(name))
const missing = assets.filter(name => !sw.includes(`assets/${name}`))
if (missing.length) throw new Error(`Chunks absent from precache: ${missing.join(', ')}`)
const html = fs.readFileSync('dist/index.html', 'utf8')
const entry = html.match(/src="[^\"]*\/assets\/([^\"]+\.js)"/)[1]
const bytes = fs.readFileSync(path.join('dist/assets', entry))
console.log(JSON.stringify({ entry, bytes: bytes.length, gzip: gzipSync(bytes).length, precachedChunks: assets.length }))
