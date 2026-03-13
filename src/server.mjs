import http from 'node:http';
import { loadRuntimeConfig } from './lib/config.mjs';
import { normalizeIncomingBody } from './lib/parser.mjs';
import { findMatchingHunt } from './lib/hunts.mjs';
import { projectWorldPosition } from './lib/projector.mjs';
import { buildRecord, buildDedupeKey } from './lib/record-builder.mjs';
import { appendRecord, writeImageArtifact } from './lib/store.mjs';
import { renderRecordPng } from './lib/png-renderer.mjs';
import { sendDiscordWebhook } from './lib/discord.mjs';

function parseArgs(argv) {
  const args = { config: './config/example.config.json', hunts: null };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--config' && next) {
      args.config = next;
      index += 1;
    } else if (current === '--hunts' && next) {
      args.hunts = next;
      index += 1;
    }
  }

  return args;
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function normalizedText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';

    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });

    request.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function createRuntimeState() {
  return {
    currentMapId: null,
    currentZoneName: null,
    currentPlaceName: null,
    primaryPlayerName: null,
    primaryPlayerEntityId: null,
    dedupe: new Map(),
    combatants: new Map(),
    recentEvents: [],
  };
}

function mergeWorldPosition(previousWorld, nextWorld) {
  const previous = previousWorld ?? null;
  const next = nextWorld ?? null;

  if (!previous && !next) {
    return null;
  }

  return {
    x:
      next?.x !== null && next?.x !== undefined
        ? next.x
        : previous?.x ?? null,
    y:
      next?.y !== null && next?.y !== undefined
        ? next.y
        : previous?.y ?? null,
    z:
      next?.z !== null && next?.z !== undefined
        ? next.z
        : previous?.z ?? null,
  };
}

function normalizeEntityId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString(16).toUpperCase();
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text.startsWith('0x') || text.startsWith('0X')) {
    return text.slice(2).toUpperCase();
  }

  return text.toUpperCase();
}

function rememberRecentEvent(state, event, result) {
  state.recentEvents.unshift({
    at: new Date().toISOString(),
    type: event.type ?? null,
    lineCode: event.lineCode ?? null,
    entityId: normalizeEntityId(event.entityId),
    name: event.name ?? null,
    accepted: Boolean(result?.accepted),
    reason: result?.reason ?? null,
  });

  if (state.recentEvents.length > 50) {
    state.recentEvents.length = 50;
  }
}

function updateCombatantState(state, event) {
  const entityId = normalizeEntityId(event?.entityId);
  if (!entityId) {
    return;
  }

  if (event.type === 'combatant-remove-memory') {
    state.combatants.delete(entityId);
    return;
  }

  const previous = state.combatants.get(entityId) ?? {};
  const next = {
    entityId,
    name: event.name ?? previous.name ?? null,
    bnpcNameId: event.bnpcNameId ?? previous.bnpcNameId ?? null,
    bnpcId: event.bnpcId ?? previous.bnpcId ?? null,
    lastSeenAt: new Date().toISOString(),
    world: mergeWorldPosition(previous.world, event.world),
  };

  state.combatants.set(entityId, next);
}

function enrichEventFromCombatantState(state, event) {
  const entityId = normalizeEntityId(event?.entityId);
  if (!entityId) {
    return event;
  }

  const known = state.combatants.get(entityId);
  if (!known) {
    return {
      ...event,
      entityId,
    };
  }

  return {
    ...event,
    entityId,
    name: event.name ?? known.name ?? null,
    bnpcNameId: event.bnpcNameId ?? known.bnpcNameId ?? null,
    bnpcId: event.bnpcId ?? known.bnpcId ?? null,
    world: mergeWorldPosition(known.world, event.world),
  };
}

function shouldSkipAsDuplicate(state, dedupeKey, dedupeMinutes) {
  const now = Date.now();
  const ttlMs = dedupeMinutes * 60 * 1000;
  const previous = state.dedupe.get(dedupeKey);

  for (const [key, timestamp] of state.dedupe.entries()) {
    if (now - timestamp > ttlMs) {
      state.dedupe.delete(key);
    }
  }

  if (previous && now - previous < ttlMs) {
    return true;
  }

  state.dedupe.set(dedupeKey, now);
  return false;
}

function resolvePrimaryPlayerCombatant(state) {
  if (state.primaryPlayerEntityId && state.combatants.has(state.primaryPlayerEntityId)) {
    return state.combatants.get(state.primaryPlayerEntityId);
  }

  if (state.primaryPlayerName) {
    const namedMatch = Array.from(state.combatants.values()).find(
      (combatant) => combatant.name === state.primaryPlayerName,
    );
    if (namedMatch) {
      return namedMatch;
    }
  }

  const candidates = Array.from(state.combatants.values())
    .filter((combatant) => typeof combatant.entityId === 'string' && combatant.entityId.startsWith('10'))
    .sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)));

  return candidates[0] ?? null;
}

function listPrimaryPlayerCandidates(state) {
  return Array.from(state.combatants.values())
    .filter((combatant) => typeof combatant.entityId === 'string' && combatant.entityId.startsWith('10'))
    .sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)))
    .slice(0, 10);
}

function resolveMapContext(runtimeMaps, explicitMapId, currentMapId, defaultMapId, zoneName) {
  const configuredMaps = runtimeMaps ?? {};
  const directIds = [explicitMapId, currentMapId, defaultMapId]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));

  for (const mapId of directIds) {
    const mapConfig = configuredMaps[mapId];
    if (mapConfig) {
      return { mapId, mapConfig };
    }
  }

  const zoneKey = normalizedText(zoneName);
  if (zoneKey) {
    for (const [mapId, mapConfig] of Object.entries(configuredMaps)) {
      const zoneNames = [mapConfig.zoneName, ...(mapConfig.zoneAliases ?? [])]
        .map(normalizedText)
        .filter(Boolean);

      if (zoneNames.includes(zoneKey)) {
        return { mapId, mapConfig };
      }
    }
  }

  return {
    mapId: directIds[0] ?? null,
    mapConfig: null,
  };
}

function hydrateStateMapContext(runtime, state, explicitMapId, zoneName, defaultMapId = null) {
  const resolved = resolveMapContext(
    runtime.config.maps,
    explicitMapId,
    state.currentMapId,
    defaultMapId,
    zoneName ?? state.currentZoneName,
  );

  if (resolved.mapId && !state.currentMapId) {
    state.currentMapId = resolved.mapId;
  }

  if (resolved.mapConfig && !state.currentZoneName && resolved.mapConfig.zoneName) {
    state.currentZoneName = resolved.mapConfig.zoneName;
  }

  return resolved;
}

async function processNormalizedEvent({ event, runtime, state }) {
  state.currentMapId = event.mapId ?? state.currentMapId;
  state.currentZoneName = event.zoneName ?? state.currentZoneName;
  state.currentPlaceName = event.placeName ?? state.currentPlaceName;
  state.primaryPlayerName = event.detectedBy ?? state.primaryPlayerName;
  state.primaryPlayerEntityId = normalizeEntityId(event.primaryPlayerId) ?? state.primaryPlayerEntityId;
  hydrateStateMapContext(runtime, state, event.mapId, event.zoneName);

  if (event.type === 'map-change') {
    return { accepted: true, type: event.type };
  }

  updateCombatantState(state, event);
  const enrichedEvent = enrichEventFromCombatantState(state, event);

  if (!['combatant-add', 'combatant-update', 'combatant-remove', 'combatant-death', 'hunt-spawn'].includes(enrichedEvent.type)) {
    return { accepted: false, type: event.type, reason: 'unsupported-event-type' };
  }

  const hunt = findMatchingHunt(runtime.hunts, enrichedEvent);

  if (!hunt) {
    return { accepted: false, type: enrichedEvent.type, reason: 'no-hunt-match' };
  }

  if (Array.isArray(hunt.alertOn) && hunt.alertOn.length && !hunt.alertOn.includes(enrichedEvent.type)) {
    return { accepted: false, type: enrichedEvent.type, reason: 'event-not-enabled' };
  }

  const zoneName = enrichedEvent.zoneName ?? state.currentZoneName ?? null;
  const resolvedMap = hydrateStateMapContext(
    runtime,
    state,
    enrichedEvent.mapId,
    zoneName,
    hunt.defaultMapId,
  );
  const mapId = resolvedMap.mapId;
  const mapConfig = resolvedMap.mapConfig;
  const placeName = enrichedEvent.placeName ?? state.currentPlaceName ?? null;
  const detectedBy = enrichedEvent.detectedBy ?? runtime.config.identity.detectedBy ?? null;
  const projected = projectWorldPosition(enrichedEvent.world, mapConfig);

  const record = buildRecord({
    event: enrichedEvent,
    hunt,
    mapConfig,
    projected,
    detectedBy,
    instanceLabel: runtime.config.identity.instanceLabel,
    zoneName,
    placeName,
    mapId,
  });

  const dedupeKey = buildDedupeKey(record);
  if (shouldSkipAsDuplicate(state, dedupeKey, runtime.config.storage.dedupeMinutes)) {
    return { accepted: false, type: event.type, reason: 'duplicate', record };
  }

  await appendRecord(runtime.config.storage.recordsPath, record);
  const png = await renderRecordPng(record, mapConfig);
  const imagePath = await writeImageArtifact(
    runtime.config.storage.imageOutputDir,
    record.recordId,
    png,
    'png',
  );
  let webhookResult;
  try {
    webhookResult = await sendDiscordWebhook(runtime.config.discord.webhookUrl, record, png);
  } catch (error) {
    webhookResult = {
      delivered: false,
      reason: 'webhook-error',
      error: error.message,
    };
  }

  return {
    accepted: true,
    type: event.type,
    record,
    imagePath,
    webhook: webhookResult,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = await loadRuntimeConfig(args.config, args.hunts);
  const state = createRuntimeState();

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);

      if (request.method === 'OPTIONS') {
        json(response, 204, {});
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        json(response, 200, {
          ok: true,
          configPath: runtime.absoluteConfigPath,
          huntsPath: runtime.huntsPath,
          recordsPath: runtime.config.storage.recordsPath,
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/debug/state') {
        const resolvedMap = hydrateStateMapContext(
          runtime,
          state,
          state.currentMapId,
          state.currentZoneName,
        );
        const currentMapConfig = resolvedMap.mapConfig ?? null;
        json(response, 200, {
          ok: true,
          currentMapId: resolvedMap.mapId ?? state.currentMapId,
          currentZoneName: state.currentZoneName,
          currentPlaceName: state.currentPlaceName,
          primaryPlayerName: state.primaryPlayerName,
          primaryPlayerEntityId: state.primaryPlayerEntityId,
          currentMapConfigured: Boolean(currentMapConfig),
          configuredMapIds: Object.keys(runtime.config.maps ?? {}),
          dedupeEntries: state.dedupe.size,
          trackedCombatants: state.combatants.size,
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/debug/player') {
        const player = resolvePrimaryPlayerCombatant(state);
        json(response, 200, {
          ok: true,
          primaryPlayerName: state.primaryPlayerName,
          primaryPlayerEntityId: state.primaryPlayerEntityId,
          player,
          candidates: listPrimaryPlayerCandidates(state),
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/debug/recent') {
        json(response, 200, {
          ok: true,
          events: state.recentEvents,
        });
        return;
      }

      if (
        request.method === 'POST' &&
        (requestUrl.pathname === '/ingest' || requestUrl.pathname === '/simulate/spawn')
      ) {
        const body = await readJsonBody(request);
        const normalizedEvents = normalizeIncomingBody(body, runtime.config.parser);
        const results = [];

        for (const event of normalizedEvents) {
          const result = await processNormalizedEvent({ event, runtime, state });
          rememberRecentEvent(state, event, result);
          results.push(result);
        }

        json(response, 200, {
          ok: true,
          received: normalizedEvents.length,
          results,
        });
        return;
      }

      json(response, 404, {
        ok: false,
        message: `No route for ${request.method} ${requestUrl.pathname}`,
      });
    } catch (error) {
      json(response, 500, {
        ok: false,
        error: error.message,
      });
    }
  });

  await new Promise((resolve) => {
    server.listen(runtime.config.server.port, runtime.config.server.host, resolve);
  });

  const serverAddress = `http://${runtime.config.server.host}:${runtime.config.server.port}`;
  console.log(`Hunt notifier listening on ${serverAddress}`);
  console.log(`Config: ${runtime.absoluteConfigPath}`);
  console.log(`Hunts: ${runtime.huntsPath}`);
  console.log(`Records: ${runtime.config.storage.recordsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
