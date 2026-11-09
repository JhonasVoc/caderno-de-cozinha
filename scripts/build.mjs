// Valida as receitas e vídeos e gera data/caderno.js, que o site carrega.
// Uso: node scripts/build.mjs   (ou: npm run build)
// Sem dependências: só Node 18+.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UNITS = new Set(['', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pinch']);
const errors = [];
const warn = [];

function readDir(dir) {
  const path = join(ROOT, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(f => f.endsWith('.json')).sort().map(f => {
    const id = f.slice(0, -5);
    try { return { id, file: `${dir}/${f}`, data: JSON.parse(readFileSync(join(path, f), 'utf8')) }; }
    catch (e) { errors.push(`${dir}/${f}: JSON inválido (${e.message})`); return null; }
  }).filter(Boolean);
}

const recipes = readDir('recipes').map(({ id, file, data: r }) => {
  const where = file;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`${where}: o nome do arquivo deve ser um slug (letras minúsculas, números e hífens).`);
  if (!r.title) errors.push(`${where}: falta "title".`);
  if (!Array.isArray(r.ingredients)) errors.push(`${where}: "ingredients" deve ser uma lista.`);
  if (!Array.isArray(r.steps)) errors.push(`${where}: "steps" deve ser uma lista.`);
  const ids = new Set();
  for (const i of r.ingredients || []) {
    if (i.id == null) errors.push(`${where}: ingrediente sem "id" (${i.name}).`);
    else if (ids.has(String(i.id))) errors.push(`${where}: id de ingrediente repetido: ${i.id}.`);
    ids.add(String(i.id));
    if (i.unit != null && !UNITS.has(i.unit)) errors.push(`${where}: unidade "${i.unit}" desconhecida em "${i.name}". Use: ${[...UNITS].map(u => u || '""').join(', ')}.`);
    if (i.amount !== '' && i.amount != null && !isFinite(Number(i.amount))) errors.push(`${where}: quantidade não numérica em "${i.name}".`);
  }
  for (const [n, s] of (r.steps || []).entries()) {
    for (const m of String(s.content || '').matchAll(/\{(\w+)\}/g)) {
      if (!ids.has(m[1])) errors.push(`${where}: passo ${n + 1} cita {${m[1]}}, que não existe nos ingredientes.`);
      else if (String((r.ingredients.find(i => String(i.id) === m[1]) || {}).name || '').startsWith('## ')) errors.push(`${where}: passo ${n + 1} cita {${m[1]}}, que é um título de grupo, não um ingrediente.`);
    }
    if (s.timer != null && !(Number(s.timer) >= 0)) errors.push(`${where}: passo ${n + 1} tem timer inválido.`);
  }
  for (const im of r.images || []) {
    if (!im.src || !existsSync(join(ROOT, im.src))) errors.push(`${where}: imagem não encontrada: ${im.src}.`);
  }
  if (!r.category) warn.push(`${where}: sem categoria.`);
  return { id, ...r };
});

const videos = readDir('videos').map(({ id, file, data: v }) => {
  if (!/^https?:\/\//.test(v.url || '')) errors.push(`${file}: "url" deve começar com http(s)://.`);
  return { id, ...v };
});

if (warn.length) console.warn('Avisos:\n  ' + warn.join('\n  '));
if (errors.length) {
  console.error(`\n${errors.length} erro(s):\n  ` + errors.join('\n  '));
  console.error('\nNada foi gerado. Corrija e rode de novo.');
  process.exit(1);
}

recipes.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
videos.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
mkdirSync(join(ROOT, 'data'), { recursive: true });
const out = `// Gerado por scripts/build.mjs. Não edite à mão: edite recipes/ e videos/ e rode npm run build.\nwindow.CADERNO = ${JSON.stringify({ recipes, videos }, null, 0)};\n`;
writeFileSync(join(ROOT, 'data', 'caderno.js'), out);
console.log(`OK: ${recipes.length} receitas e ${videos.length} vídeos em data/caderno.js`);
