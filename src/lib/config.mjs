import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function loadRuntimeConfig(configPath, huntsPathOverride) {
  const absoluteConfigPath = path.resolve(configPath);
  const configDir = path.dirname(absoluteConfigPath);
  const config = await loadJson(absoluteConfigPath);

  const recordsPath = path.resolve(configDir, config.storage.recordsPath);
  const imageOutputDir = config.storage.imageOutputDir
    ? path.resolve(configDir, config.storage.imageOutputDir)
    : null;
  const maps = Object.fromEntries(
    Object.entries(config.maps ?? {}).map(([mapId, entry]) => [
      mapId,
      {
        ...entry,
        imagePath: entry.imagePath ? path.resolve(configDir, entry.imagePath) : null,
      },
    ]),
  );

  const huntsPath = huntsPathOverride
    ? path.resolve(huntsPathOverride)
    : path.resolve(configDir, './hunts.sample.json');
  const hunts = await loadJson(huntsPath);

  return {
    absoluteConfigPath,
    configDir,
    config: {
      ...config,
      maps,
      storage: {
        ...config.storage,
        recordsPath,
        imageOutputDir,
      },
    },
    hunts,
    huntsPath,
  };
}
