import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const file of [...readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f), 'sw.js', 'server/dev.mjs']) execFileSync(process.execPath, ['--check', file]);
const html = readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
const sw = readFileSync('sw.js', 'utf8');
for (const file of readdirSync('js').filter(f => f.endsWith('.js'))) if (!sw.includes(`js/${file}`)) throw new Error(`Not cached: ${file}`);
console.log('JavaScript syntax, HTML IDs and service-worker shell OK');
