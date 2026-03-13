import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const execFileAsync = promisify(execFile);
const rendererScriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/render-map-png.ps1',
);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rgba(r, g, b, a = 255) {
  return { r, g, b, a };
}

function resolveAccent(record) {
  if (record.rank === 'S') {
    return {
      primary: rgba(237, 192, 83, 255),
      soft: rgba(255, 241, 202, 255),
      frame: rgba(237, 192, 83, 255),
      grid: rgba(141, 120, 54, 86),
    };
  }

  if (record.rank === 'A') {
    return {
      primary: rgba(255, 90, 95, 255),
      soft: rgba(255, 216, 217, 255),
      frame: rgba(67, 99, 143, 255),
      grid: rgba(58, 84, 122, 86),
    };
  }

  return {
    primary: rgba(77, 200, 193, 255),
    soft: rgba(201, 255, 247, 255),
    frame: rgba(73, 162, 168, 255),
    grid: rgba(46, 108, 118, 86),
  };
}

function createSurface(width, height, color = rgba(0, 0, 0, 255)) {
  const data = Buffer.alloc(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
  }

  return { width, height, data };
}

function pixelOffset(surface, x, y) {
  return (y * surface.width + x) * 4;
}

function setPixel(surface, x, y, color) {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) {
    return;
  }

  const offset = pixelOffset(surface, x, y);
  const srcAlpha = color.a / 255;
  const dstAlpha = surface.data[offset + 3] / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  if (outAlpha <= 0) {
    surface.data[offset] = 0;
    surface.data[offset + 1] = 0;
    surface.data[offset + 2] = 0;
    surface.data[offset + 3] = 0;
    return;
  }

  const blend = (src, dst) =>
    Math.round((src * srcAlpha + dst * dstAlpha * (1 - srcAlpha)) / outAlpha);

  surface.data[offset] = blend(color.r, surface.data[offset]);
  surface.data[offset + 1] = blend(color.g, surface.data[offset + 1]);
  surface.data[offset + 2] = blend(color.b, surface.data[offset + 2]);
  surface.data[offset + 3] = Math.round(outAlpha * 255);
}

function fillRect(surface, x, y, width, height, color) {
  const minX = clamp(Math.floor(x), 0, surface.width);
  const minY = clamp(Math.floor(y), 0, surface.height);
  const maxX = clamp(Math.ceil(x + width), 0, surface.width);
  const maxY = clamp(Math.ceil(y + height), 0, surface.height);

  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      setPixel(surface, px, py, color);
    }
  }
}

function strokeRect(surface, x, y, width, height, color, thickness = 1) {
  fillRect(surface, x, y, width, thickness, color);
  fillRect(surface, x, y + height - thickness, width, thickness, color);
  fillRect(surface, x, y, thickness, height, color);
  fillRect(surface, x + width - thickness, y, thickness, height, color);
}

function drawLine(surface, x0, y0, x1, y1, color, thickness = 1) {
  let startX = Math.round(x0);
  let startY = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const deltaX = Math.abs(endX - startX);
  const stepX = startX < endX ? 1 : -1;
  const deltaY = -Math.abs(endY - startY);
  const stepY = startY < endY ? 1 : -1;
  let error = deltaX + deltaY;

  while (true) {
    fillRect(
      surface,
      startX - Math.floor(thickness / 2),
      startY - Math.floor(thickness / 2),
      thickness,
      thickness,
      color,
    );

    if (startX === endX && startY === endY) {
      break;
    }

    const doubleError = 2 * error;
    if (doubleError >= deltaY) {
      error += deltaY;
      startX += stepX;
    }
    if (doubleError <= deltaX) {
      error += deltaX;
      startY += stepY;
    }
  }
}

function fillCircle(surface, centerX, centerY, radius, color) {
  const minX = clamp(Math.floor(centerX - radius), 0, surface.width - 1);
  const maxX = clamp(Math.ceil(centerX + radius), 0, surface.width - 1);
  const minY = clamp(Math.floor(centerY - radius), 0, surface.height - 1);
  const maxY = clamp(Math.ceil(centerY + radius), 0, surface.height - 1);
  const radiusSq = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radiusSq) {
        setPixel(surface, x, y, color);
      }
    }
  }
}

function strokeCircle(surface, centerX, centerY, radius, color, thickness = 1) {
  const outerSq = radius * radius;
  const inner = Math.max(radius - thickness, 0);
  const innerSq = inner * inner;
  const minX = clamp(Math.floor(centerX - radius), 0, surface.width - 1);
  const maxX = clamp(Math.ceil(centerX + radius), 0, surface.width - 1);
  const minY = clamp(Math.floor(centerY - radius), 0, surface.height - 1);
  const maxY = clamp(Math.ceil(centerY + radius), 0, surface.height - 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= outerSq && distanceSq >= innerSq) {
        setPixel(surface, x, y, color);
      }
    }
  }
}

function pointInTriangle(pointX, pointY, a, b, c) {
  const area = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const p = { x: pointX, y: pointY };
  const ab = area(p, a, b) >= 0;
  const bc = area(p, b, c) >= 0;
  const ca = area(p, c, a) >= 0;
  return ab === bc && bc === ca;
}

function fillTriangle(surface, a, b, c, color) {
  const minX = clamp(Math.floor(Math.min(a.x, b.x, c.x)), 0, surface.width - 1);
  const maxX = clamp(Math.ceil(Math.max(a.x, b.x, c.x)), 0, surface.width - 1);
  const minY = clamp(Math.floor(Math.min(a.y, b.y, c.y)), 0, surface.height - 1);
  const maxY = clamp(Math.ceil(Math.max(a.y, b.y, c.y)), 0, surface.height - 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInTriangle(x + 0.5, y + 0.5, a, b, c)) {
        setPixel(surface, x, y, color);
      }
    }
  }
}

function drawGradientBackground(surface) {
  const top = rgba(23, 35, 55, 255);
  const bottom = rgba(7, 13, 24, 255);

  for (let y = 0; y < surface.height; y += 1) {
    const ratio = y / (surface.height - 1);
    const color = rgba(
      Math.round(top.r + (bottom.r - top.r) * ratio),
      Math.round(top.g + (bottom.g - top.g) * ratio),
      Math.round(top.b + (bottom.b - top.b) * ratio),
      255,
    );
    fillRect(surface, 0, y, surface.width, 1, color);
  }
}

function drawMapFrame(surface, mapBounds, record) {
  const accent = resolveAccent(record);
  const baseFill = rgba(18, 32, 57, 255);

  fillRect(surface, mapBounds.x, mapBounds.y, mapBounds.width, mapBounds.height, baseFill);
  strokeRect(surface, mapBounds.x, mapBounds.y, mapBounds.width, mapBounds.height, accent.frame, 4);

  const gridStep = 54;
  for (let x = mapBounds.x + 16; x < mapBounds.x + mapBounds.width; x += gridStep) {
    drawLine(surface, x, mapBounds.y, x, mapBounds.y + mapBounds.height, accent.grid, 1);
  }
  for (let y = mapBounds.y + 16; y < mapBounds.y + mapBounds.height; y += gridStep) {
    drawLine(surface, mapBounds.x, y, mapBounds.x + mapBounds.width, y, accent.grid, 1);
  }

  const overlay = rgba(8, 19, 31, 186);
  fillRect(surface, 40, 40, surface.width - 80, 112, overlay);
  fillRect(surface, 40, surface.height - 96, surface.width - 80, 56, overlay);

  fillRect(surface, 40, 40, 12, 112, accent.primary);
  fillRect(surface, 40, surface.height - 96, 12, 56, accent.primary);
}

function drawPin(surface, x, y, record) {
  const accent = resolveAccent(record);
  const circleRadius = 18;
  const headCenterY = y - 40;
  const triangleTopY = y - 18;
  const triangleHalfWidth = 14;
  const crossRadius = 12;

  fillCircle(surface, x, y - 2, 18, rgba(0, 0, 0, 56));
  fillTriangle(
    surface,
    { x, y },
    { x: x - triangleHalfWidth, y: triangleTopY },
    { x: x + triangleHalfWidth, y: triangleTopY },
    accent.primary,
  );
  fillCircle(surface, x, headCenterY, circleRadius, accent.primary);
  strokeCircle(surface, x, headCenterY, circleRadius, rgba(255, 255, 255, 255), 3);
  fillCircle(surface, x, headCenterY - 12, 7, accent.soft);
  drawLine(surface, x - crossRadius, headCenterY, x + crossRadius, headCenterY, rgba(255, 255, 255, 96), 2);
  drawLine(surface, x, headCenterY - crossRadius, x, headCenterY + crossRadius, rgba(255, 255, 255, 96), 2);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(surface) {
  const rows = [];

  for (let y = 0; y < surface.height; y += 1) {
    const row = Buffer.alloc(1 + surface.width * 4);
    row[0] = 0;
    const start = y * surface.width * 4;
    surface.data.copy(row, 1, start, start + surface.width * 4);
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(surface.width, 0);
  ihdr.writeUInt32BE(surface.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  return Buffer.concat([
    pngSignature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function renderRecordPng(record, mapConfig) {
  const width = 1024;
  const height = 1024;
  const calibration = mapConfig?.calibration ?? {};
  const pixelMinX = calibration.pixelMinX ?? 80;
  const pixelMaxX = calibration.pixelMaxX ?? 944;
  const pixelMinY = calibration.pixelMinY ?? 80;
  const pixelMaxY = calibration.pixelMaxY ?? 944;
  const pinBounds = {
    x: Math.min(pixelMinX, pixelMaxX),
    y: Math.min(pixelMinY, pixelMaxY),
    width: Math.abs(pixelMaxX - pixelMinX),
    height: Math.abs(pixelMaxY - pixelMinY),
  };
  const imageBounds = {
    x: mapConfig?.imageBounds?.x ?? pinBounds.x,
    y: mapConfig?.imageBounds?.y ?? pinBounds.y,
    width: mapConfig?.imageBounds?.width ?? pinBounds.width,
    height: mapConfig?.imageBounds?.height ?? pinBounds.height,
  };

  if (mapConfig?.imagePath) {
    try {
      await fs.access(mapConfig.imagePath);

      const outputPath = path.join(os.tmpdir(), `hunt-map-${crypto.randomUUID()}.png`);
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        rendererScriptPath,
        '-ImagePath',
        mapConfig.imagePath,
        '-OutputPath',
        outputPath,
        '-Width',
        String(width),
        '-Height',
        String(height),
        '-MapX',
        String(imageBounds.x),
        '-MapY',
        String(imageBounds.y),
        '-MapWidth',
        String(imageBounds.width),
        '-MapHeight',
        String(imageBounds.height),
        '-PinX',
        String(clamp(Math.round(record.pixel?.x ?? width / 2), 0, width - 1)),
        '-PinY',
        String(clamp(Math.round(record.pixel?.y ?? height / 2), 0, height - 1)),
        '-Rank',
        String(record.rank ?? ''),
      ];

      try {
        await execFileAsync('powershell.exe', args, {
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 4,
        });
        return await fs.readFile(outputPath);
      } finally {
        await fs.unlink(outputPath).catch(() => {});
      }
    } catch {
      // Fall back to the synthetic renderer if the local map asset is unavailable.
    }
  }

  const surface = createSurface(width, height, rgba(0, 0, 0, 255));

  drawGradientBackground(surface);
  drawMapFrame(surface, imageBounds, record);

  const pinX = clamp(Math.round(record.pixel?.x ?? width / 2), 0, width - 1);
  const pinY = clamp(Math.round(record.pixel?.y ?? height / 2), 0, height - 1);
  drawPin(surface, pinX, pinY, record);

  return encodePng(surface);
}
