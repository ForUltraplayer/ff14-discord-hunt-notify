function isLineCode(value) {
  return /^\d{2,3}$/.test(String(value).trim());
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRawFields(input, delimiter) {
  if (Array.isArray(input)) {
    return input.map((value) => String(value));
  }

  return String(input)
    .trim()
    .split(delimiter)
    .map((value) => value.trim());
}

function locateLineCodeIndex(fields) {
  return fields.findIndex(isLineCode);
}

function buildRelativeAccessor(fields, codeIndex) {
  return (relativeIndex) => fields[codeIndex + relativeIndex];
}

function readKeyedPairs(fields, startIndex) {
  const pairs = new Map();

  for (let index = startIndex; index < fields.length - 1; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];

    if (!key || /^[a-f0-9]{16}$/i.test(key)) {
      break;
    }

    pairs.set(key, value);
  }

  return pairs;
}

function parseWithTemplate(fields, codeIndex, template, type) {
  const at = buildRelativeAccessor(fields, codeIndex);
  return {
    type,
    lineCode: template.lineCode,
    raw: fields,
    entityId: at(template.idIndex),
    name: at(template.nameIndex),
    bnpcNameId: toNumber(at(template.bnpcNameIdIndex)),
    bnpcId: toNumber(at(template.bnpcIdIndex)),
    world: {
      x: toNumber(at(template.worldXIndex)),
      y: toNumber(at(template.worldYIndex)),
      z: toNumber(at(template.worldZIndex)),
    },
    heading: toNumber(at(template.headingIndex)),
    changeType: at(template.changeTypeIndex),
    mapId: at(template.mapIdIndex),
    zoneName: at(template.zoneNameIndex),
    placeName: at(template.placeNameIndex),
  };
}

function parseLine261(fields, codeIndex) {
  const at = buildRelativeAccessor(fields, codeIndex);
  const changeType = at(2);
  const entityId = at(3);
  const keyed = readKeyedPairs(fields, codeIndex + 4);

  return {
    type: changeType === 'Remove' ? 'combatant-remove-memory' : 'combatant-update',
    lineCode: '261',
    raw: fields,
    entityId,
    name: keyed.get('Name') ?? null,
    bnpcNameId: toNumber(keyed.get('BNpcNameID')),
    bnpcId: toNumber(keyed.get('BNpcID')),
    world: {
      x: toNumber(keyed.get('PosX')),
      y: toNumber(keyed.get('PosY')),
      z: toNumber(keyed.get('PosZ')),
    },
    heading: toNumber(keyed.get('Heading')),
    changeType,
    mapId: null,
    zoneName: null,
    placeName: null,
  };
}

export function parseRawLine(line, parserConfig) {
  const fields = normalizeRawFields(line, parserConfig.delimiter ?? '|');
  const codeIndex = locateLineCodeIndex(fields);

  if (codeIndex < 0) {
    return [];
  }

  const lineCode = fields[codeIndex];

  if (lineCode === parserConfig.line03?.lineCode) {
    return [parseWithTemplate(fields, codeIndex, parserConfig.line03, 'combatant-add')];
  }

  if (lineCode === parserConfig.line40?.lineCode) {
    return [parseWithTemplate(fields, codeIndex, parserConfig.line40, 'map-change')];
  }

  if (lineCode === parserConfig.line04?.lineCode) {
    return [parseWithTemplate(fields, codeIndex, parserConfig.line04, 'combatant-remove')];
  }

  if (lineCode === parserConfig.line25?.lineCode) {
    return [parseWithTemplate(fields, codeIndex, parserConfig.line25, 'combatant-death')];
  }

  if (lineCode === parserConfig.line261?.lineCode) {
    return [parseLine261(fields, codeIndex)];
  }

  return [];
}

export function normalizeIncomingBody(body, parserConfig) {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const applySharedMetadata = (event) => ({
    ...event,
    detectedBy: event.detectedBy ?? body.detectedBy ?? null,
    primaryPlayerId: event.primaryPlayerId ?? body.primaryPlayerId ?? null,
    mapId: event.mapId ?? body.mapId ?? null,
    zoneName: event.zoneName ?? body.zoneName ?? null,
    placeName: event.placeName ?? body.placeName ?? null,
  });

  if (Array.isArray(body.lines)) {
    return body.lines.flatMap((line) => parseRawLine(line, parserConfig).map(applySharedMetadata));
  }

  if (body.line) {
    return parseRawLine(body.line, parserConfig).map(applySharedMetadata);
  }

  if (body.type === 'hunt-spawn' || body.type === 'tracked-spawn') {
    const tracked = body.target ?? body.hunt ?? null;
    return [
      applySharedMetadata({
        type: 'hunt-spawn',
        hunt: tracked,
        entityId: body.entityId,
        mapId: body.mapId,
        zoneName: body.zoneName,
        placeName: body.placeName,
        world: body.world,
        detectedBy: body.detectedBy,
        primaryPlayerId: body.primaryPlayerId,
      }),
    ];
  }

  if (body.type === 'player-snapshot') {
    return [
      applySharedMetadata({
        type: 'combatant-update',
        lineCode: 'snapshot',
        entityId: body.entityId,
        name: body.detectedBy ?? null,
        world: body.world,
        detectedBy: body.detectedBy,
        primaryPlayerId: body.primaryPlayerId,
      }),
    ];
  }

  return [];
}
