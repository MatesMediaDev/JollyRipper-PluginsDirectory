import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const pluginsDir = './plugins';

async function updateIndex() {
  const files = await readdir(pluginsDir);
  const pluginIds = files
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''))
    .sort();

  const index = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    plugins: pluginIds
  };

  await writeFile(
    join(pluginsDir, 'index.json'),
    JSON.stringify(index, null, 2) + '\n'
  );

  console.log(`✅ Updated index.json with ${pluginIds.length} plugins`);
  console.log('Plugins:', pluginIds.join(', '));
}

updateIndex().catch(console.error);
