import fs from 'node:fs/promises';
import path from 'node:path';

export async function appendRecord(recordsPath, record) {
  await fs.mkdir(path.dirname(recordsPath), { recursive: true });
  await fs.appendFile(recordsPath, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function writeImageArtifact(imageOutputDir, recordId, imageBuffer, extension = 'png') {
  if (!imageOutputDir) {
    return null;
  }

  await fs.mkdir(imageOutputDir, { recursive: true });
  const outputPath = path.join(imageOutputDir, `${recordId}.${extension}`);
  await fs.writeFile(outputPath, imageBuffer);
  return outputPath;
}
