function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function interpolate(input, inputMin, inputMax, outputMin, outputMax) {
  if (inputMin === inputMax) {
    return outputMin;
  }

  const ratio = (input - inputMin) / (inputMax - inputMin);
  return outputMin + ratio * (outputMax - outputMin);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function normalizeAxis(axis, fallback) {
  const normalized = String(axis ?? fallback ?? '').trim().toLowerCase();
  if (normalized === 'x' || normalized === 'y' || normalized === 'z') {
    return normalized;
  }

  return fallback;
}

function readWorldValue(world, axis) {
  const value = world?.[axis];
  return Number.isFinite(value) ? value : null;
}

function readCalibrationBound(calibration, prefix, axis) {
  const suffix = axis.toUpperCase();
  const direct = calibration?.[`${prefix}${suffix}`];
  if (Number.isFinite(direct)) {
    return direct;
  }

  if (axis === 'y') {
    const fallback = calibration?.[`${prefix}Z`];
    return Number.isFinite(fallback) ? fallback : null;
  }

  return null;
}

function worldToMapCoordinate(value, offset = 0, sizeFactor = 100) {
  if (!Number.isFinite(value) || !Number.isFinite(offset) || !Number.isFinite(sizeFactor) || sizeFactor === 0) {
    return null;
  }

  const scale = sizeFactor / 100;
  return (((value + offset + 1024) / 2048) * 41) / scale + 1;
}

function projectUsingFormula(world, mapConfig) {
  const formula = mapConfig?.formula;
  if (!formula) {
    return null;
  }

  const horizontalAxis = normalizeAxis(mapConfig.worldAxes?.horizontal, 'x');
  const verticalAxis = normalizeAxis(mapConfig.worldAxes?.vertical, 'y');
  const worldHorizontal = readWorldValue(world, horizontalAxis);
  const worldVertical = readWorldValue(world, verticalAxis);

  if (!Number.isFinite(worldHorizontal) || !Number.isFinite(worldVertical)) {
    return null;
  }

  const mapX = worldToMapCoordinate(worldHorizontal, formula.offsetX ?? 0, formula.sizeFactor ?? 100);
  const mapY = worldToMapCoordinate(worldVertical, formula.offsetY ?? 0, formula.sizeFactor ?? 100);

  if (!Number.isFinite(mapX) || !Number.isFinite(mapY)) {
    return null;
  }

  const mapRange = mapConfig.mapRange ?? {
    minX: 1,
    maxX: 41,
    minY: 1,
    maxY: 41,
  };
  const pixelBounds = mapConfig.pixelBounds ?? null;

  const projected = {
    mapX: round(mapX, 1),
    mapY: round(mapY, 1),
    pixelX: null,
    pixelY: null,
  };

  if (pixelBounds) {
    const pixelX = interpolate(
      mapX,
      mapRange.minX,
      mapRange.maxX,
      pixelBounds.minX,
      pixelBounds.maxX,
    );
    const pixelY = interpolate(
      mapY,
      mapRange.minY,
      mapRange.maxY,
      pixelBounds.minY,
      pixelBounds.maxY,
    );

    projected.pixelX = round(
      clamp(
        pixelX,
        Math.min(pixelBounds.minX, pixelBounds.maxX),
        Math.max(pixelBounds.minX, pixelBounds.maxX),
      ),
      1,
    );
    projected.pixelY = round(
      clamp(
        pixelY,
        Math.min(pixelBounds.minY, pixelBounds.maxY),
        Math.max(pixelBounds.minY, pixelBounds.maxY),
      ),
      1,
    );
  }

  return projected;
}

export function projectWorldPosition(world, mapConfig) {
  if (!world) {
    return null;
  }

  const formulaProjection = projectUsingFormula(world, mapConfig);
  if (formulaProjection) {
    return formulaProjection;
  }

  if (!mapConfig?.calibration) {
    return null;
  }

  const calibration = mapConfig.calibration;
  const horizontalAxis = normalizeAxis(mapConfig.worldAxes?.horizontal, 'x');
  const verticalAxis = normalizeAxis(mapConfig.worldAxes?.vertical, 'z');
  const worldHorizontal = readWorldValue(world, horizontalAxis);
  const worldVertical = readWorldValue(world, verticalAxis);
  const worldMinHorizontal = readCalibrationBound(calibration, 'worldMin', horizontalAxis);
  const worldMaxHorizontal = readCalibrationBound(calibration, 'worldMax', horizontalAxis);
  const worldMinVertical = readCalibrationBound(calibration, 'worldMin', verticalAxis);
  const worldMaxVertical = readCalibrationBound(calibration, 'worldMax', verticalAxis);

  if (
    !Number.isFinite(worldHorizontal) ||
    !Number.isFinite(worldVertical) ||
    !Number.isFinite(worldMinHorizontal) ||
    !Number.isFinite(worldMaxHorizontal) ||
    !Number.isFinite(worldMinVertical) ||
    !Number.isFinite(worldMaxVertical)
  ) {
    return null;
  }

  const mapX = interpolate(
    worldHorizontal,
    worldMinHorizontal,
    worldMaxHorizontal,
    calibration.mapMinX,
    calibration.mapMaxX,
  );

  const mapY = interpolate(
    worldVertical,
    worldMinVertical,
    worldMaxVertical,
    calibration.mapMinY,
    calibration.mapMaxY,
  );

  const pixelX = interpolate(
    worldHorizontal,
    worldMinHorizontal,
    worldMaxHorizontal,
    calibration.pixelMinX,
    calibration.pixelMaxX,
  );

  const pixelY = interpolate(
    worldVertical,
    worldMinVertical,
    worldMaxVertical,
    calibration.pixelMinY,
    calibration.pixelMaxY,
  );

  return {
    mapX: round(mapX, 1),
    mapY: round(mapY, 1),
    pixelX: round(
      clamp(
        pixelX,
        Math.min(calibration.pixelMinX, calibration.pixelMaxX),
        Math.max(calibration.pixelMinX, calibration.pixelMaxX),
      ),
      1,
    ),
    pixelY: round(
      clamp(
        pixelY,
        Math.min(calibration.pixelMinY, calibration.pixelMaxY),
        Math.max(calibration.pixelMinY, calibration.pixelMaxY),
      ),
      1,
    ),
  };
}
