// Validates the published JSON library in docs/app/data. Dependency-free; exits non-zero on any error.
import {readFile, readdir} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateLibrary} from '../docs/app/lib/library.js';

const dataDir = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../docs/app/data/', import.meta.url));

async function readJson(file) {
  const text = await readFile(file, 'utf8');
  try { return {value: JSON.parse(text), size: Buffer.byteLength(text)}; }
  catch (error) { throw new Error(`${relative(dataDir, file)}: kein gültiges JSON (${error.message})`); }
}

export async function validateDirectory(dir) {
  const errors = [];
  const index = await readJson(join(dir, 'library-index.json'));
  const taxonomy = await readJson(join(dir, 'taxonomy.json'));
  const entries = {}, sizes = {index: index.size};
  const files = [];
  for (const folder of ['processes', 'patterns']) {
    let names = [];
    try { names = await readdir(join(dir, folder)); } catch { continue; }
    for (const name of names.filter(n => n.endsWith('.json'))) files.push(`${folder}/${name}`);
  }
  for (const path of files) {
    try { const {value, size} = await readJson(join(dir, path)); entries[path] = value; sizes[path] = size; }
    catch (error) { errors.push(error.message); }
  }
  errors.push(...validateLibrary({index: index.value, entries, taxonomy: taxonomy.value, sizes}));
  const indexed = new Set((index.value.entries || []).map(e => e.path));
  for (const path of files) if (!indexed.has(path)) errors.push(`${path}: Datei ist nicht im Index aufgeführt.`);
  return {errors, count: files.length};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {errors, count} = await validateDirectory(dataDir);
  if (errors.length) {
    console.error(`Bibliothek ungültig (${errors.length} Fehler):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`Bibliothek gültig: ${count} Einträge geprüft.`);
}
