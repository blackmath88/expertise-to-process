import {readFile} from 'node:fs/promises';
const data = new URL('../docs/app/data/', import.meta.url);
export const readData = async path => JSON.parse(await readFile(new URL(path, data), 'utf8'));
export async function loadLibraryFiles() {
  const index = await readData('library-index.json');
  const taxonomy = await readData('taxonomy.json');
  const entries = {};
  for (const item of index.entries) entries[item.path] = await readData(item.path);
  return {index, taxonomy, entries};
}
export const clone = v => JSON.parse(JSON.stringify(v));
