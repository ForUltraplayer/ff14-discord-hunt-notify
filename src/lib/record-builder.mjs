import crypto from 'node:crypto';

function round(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

export function buildRecord({
  event,
  hunt,
  mapConfig,
  projected,
  detectedBy,
  instanceLabel,
  zoneName,
  placeName,
  mapId,
}) {
  return {
    recordId: crypto.randomUUID(),
    detectedAt: new Date().toISOString(),
    huntKey: hunt.key,
    category: hunt.category ?? 'hunt',
    alertLabel: hunt.alertLabel ?? (hunt.rank ? `${hunt.rank}급 발견` : '대상 감지'),
    rank: hunt.rank,
    mobName: event.name ?? event.hunt?.name ?? hunt.name,
    entityId: event.entityId ?? null,
    bnpcNameId: event.bnpcNameId ?? null,
    bnpcId: event.bnpcId ?? null,
    zoneName: zoneName || mapConfig?.zoneName || null,
    placeName: placeName || null,
    mapId: mapId ?? hunt.defaultMapId ?? null,
    instanceLabel: instanceLabel || null,
    detectedBy: detectedBy ?? null,
    world: {
      x: round(event.world?.x),
      y: round(event.world?.y),
      z: round(event.world?.z),
    },
    map: projected
      ? {
          x: projected.mapX,
          y: projected.mapY,
        }
      : null,
    pixel: projected
      ? {
          x: projected.pixelX,
          y: projected.pixelY,
        }
      : null,
  };
}

export function buildDedupeKey(record) {
  const mapX = record.map?.x ?? 'na';
  const mapY = record.map?.y ?? 'na';
  const worldX =
    typeof record.world?.x === 'number' && Number.isFinite(record.world.x)
      ? Number(record.world.x.toFixed(1))
      : 'na';
  const worldZ =
    typeof record.world?.z === 'number' && Number.isFinite(record.world.z)
      ? Number(record.world.z.toFixed(1))
      : 'na';
  return [
    record.category ?? 'hunt',
    record.huntKey,
    record.mapId ?? 'unknown-map',
    mapX,
    mapY,
    worldX,
    worldZ,
    record.entityId ?? 'unknown-entity',
  ].join('|');
}
