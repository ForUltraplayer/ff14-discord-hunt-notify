(function bridgeBootstrap() {
  const overlayConfig = window.HuntBridgeConfig ?? {};
  const query = new URLSearchParams(window.location.search);

  const config = {
    endpoint: query.get('endpoint') || overlayConfig.endpoint || 'http://127.0.0.1:5059/ingest',
    lineCodes: (query.get('codes') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    flushIntervalMs: Number(query.get('flush')) || overlayConfig.flushIntervalMs || 350,
    maxBatchSize: overlayConfig.maxBatchSize || 32,
    playerSnapshotIntervalMs: overlayConfig.playerSnapshotIntervalMs || 2000,
    overlayName: overlayConfig.overlayName || 'hunt-ingest-bridge',
    debug: Boolean(overlayConfig.debug),
  };

  if (!config.lineCodes.length) {
    config.lineCodes = Array.isArray(overlayConfig.lineCodes) ? overlayConfig.lineCodes : ['03', '04', '25', '40', '261'];
  }

  const lineCodeSet = new Set(config.lineCodes.map((value) => String(value)));
  const state = {
    started: false,
    sending: false,
    primaryPlayer: 'unknown',
    primaryPlayerId: null,
    currentMapId: null,
    zoneText: 'unknown',
    queued: [],
    totalSent: 0,
    lastCode: '-',
    lastError: '',
    lastFlushAt: '',
    timer: null,
    playerTimer: null,
    playerSending: false,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function setStatus(kind, message, detail) {
    const dot = $('.status-dot');
    const label = $('#status-label');
    const detailNode = $('#status-detail');

    if (dot) {
      dot.className = `status-dot${kind === 'ok' ? ' ok' : kind === 'error' ? ' error' : ''}`;
    }

    if (label) {
      label.textContent = message;
    }

    if (detailNode) {
      detailNode.textContent = detail || '';
    }
  }

  function syncView() {
    $('#player-value').textContent = state.primaryPlayer;
    $('#endpoint-value').textContent = config.endpoint;
    $('#queue-value').textContent = `${state.queued.length} queued / ${state.totalSent} sent`;
    $('#filter-value').textContent = config.lineCodes.join(', ');
    $('#zone-value').textContent = state.zoneText;
    $('#last-value').textContent = state.lastCode;
  }

  function debugLog() {
    if (!config.debug) {
      return;
    }
    const args = Array.prototype.slice.call(arguments);
    console.log.apply(console, ['[hunt-bridge]'].concat(args));
  }

  function requestJson(url, payload) {
    if (window.fetch) {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then((response) => {
        if (!response.ok) {
          return response.text().then((text) => {
            throw new Error(`HTTP ${response.status}: ${text}`);
          });
        }

        return response.json();
      });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function onReadyStateChange() {
        if (xhr.readyState !== 4) {
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText || '{}'));
          } catch (error) {
            reject(error);
          }
          return;
        }

        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
      };
      xhr.onerror = function onError() {
        reject(new Error('Network request failed'));
      };
      xhr.send(JSON.stringify(payload));
    });
  }

  function normalizeCombatantId(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const text = String(value).trim();
    if (!text) {
      return null;
    }

    if (/^\d+$/.test(text)) {
      return Number(text);
    }

    if (/^[A-Fa-f0-9]+$/.test(text)) {
      return Number.parseInt(text, 16);
    }

    return null;
  }

  function toSnapshotWorld(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }

    const x = Number(snapshot.PosX ?? snapshot.posX ?? snapshot.X ?? snapshot.x);
    const y = Number(snapshot.PosY ?? snapshot.posY ?? snapshot.Y ?? snapshot.y);
    const z = Number(snapshot.PosZ ?? snapshot.posZ ?? snapshot.Z ?? snapshot.z);

    if (![x, y, z].every(Number.isFinite)) {
      return null;
    }

    return { x, y, z };
  }

  async function fetchPrimaryPlayerSnapshot() {
    if (
      state.playerSending ||
      !state.primaryPlayerId ||
      typeof window.callOverlayHandler !== 'function'
    ) {
      return;
    }

    state.playerSending = true;

    try {
      const numericId = normalizeCombatantId(state.primaryPlayerId);
      if (!numericId) {
        return;
      }

      let response = await callOverlayHandler({
        call: 'getCombatants',
        ids: [numericId],
      });

      let combatants = Array.isArray(response?.combatants) ? response.combatants : [];

      if (!combatants.length) {
        response = await callOverlayHandler({ call: 'getCombatants' });
        combatants = Array.isArray(response?.combatants) ? response.combatants : [];
      }

      const snapshot =
        combatants.find((entry) => normalizeCombatantId(entry.ID ?? entry.id) === numericId) ??
        combatants.find((entry) => (entry.Name ?? entry.name) === state.primaryPlayer) ??
        null;

      const world = toSnapshotWorld(snapshot);
      if (!snapshot || !world) {
        return;
      }

      await requestJson(config.endpoint, {
        type: 'player-snapshot',
        entityId: snapshot.ID ?? snapshot.id ?? state.primaryPlayerId,
        detectedBy: state.primaryPlayer,
        primaryPlayerId: state.primaryPlayerId,
        mapId: state.currentMapId,
        zoneName: state.zoneText,
        world,
      });
    } catch (error) {
      debugLog('player snapshot failed', error);
    } finally {
      state.playerSending = false;
    }
  }

  function scheduleFlush() {
    if (state.timer || state.sending || !state.queued.length) {
      return;
    }

    state.timer = window.setTimeout(() => {
      state.timer = null;
      flushQueue();
    }, config.flushIntervalMs);
  }

  function flushQueue() {
    if (state.sending || !state.queued.length) {
      return;
    }

    const batch = state.queued.splice(0, config.maxBatchSize);
    state.sending = true;
    syncView();
    setStatus('warn', 'Sending to local ingest', `${batch.length} line(s)`);

    requestJson(config.endpoint, {
      lines: batch,
      detectedBy: state.primaryPlayer,
      primaryPlayerId: state.primaryPlayerId,
      mapId: state.currentMapId,
      zoneName: state.zoneText,
    })
      .then((response) => {
        state.totalSent += batch.length;
        state.lastFlushAt = new Date().toLocaleTimeString();
        state.lastError = '';
        syncView();
        setStatus('ok', 'Bridge connected', `Last flush ${state.lastFlushAt}`);
        debugLog('flush ok', response);
      })
      .catch((error) => {
        state.lastError = error.message;
        state.queued = batch.concat(state.queued);
        syncView();
        setStatus('error', 'Local ingest failed', error.message);
        debugLog('flush failed', error);
      })
      .finally(() => {
        state.sending = false;
        if (state.queued.length) {
          scheduleFlush();
        }
      });
  }

  function handleLogLine(event) {
    const rawLine = event.rawLine || (Array.isArray(event.line) ? event.line.join('|') : '');
    const split = Array.isArray(event.line) ? event.line : rawLine.split('|');
    const lineCode = split[0];

    if (!lineCodeSet.has(String(lineCode))) {
      return;
    }

    if (String(lineCode) === '40' && split.length >= 3) {
      state.currentMapId = split[2] || state.currentMapId;
    }

    state.lastCode = String(lineCode);
    state.queued.push(rawLine);
    syncView();
    scheduleFlush();
  }

  function handlePrimaryPlayer(event) {
    state.primaryPlayer = event.charName || state.primaryPlayer;
    state.primaryPlayerId =
      event.charID ||
      event.charId ||
      event.id ||
      event.characterID ||
      event.characterId ||
      state.primaryPlayerId;
    syncView();
    fetchPrimaryPlayerSnapshot();
  }

  function handleChangeZone(event) {
    state.zoneText = event.zoneName || event.zoneID || state.zoneText;
    syncView();
  }

  function startBridge() {
    if (state.started) {
      return;
    }

    if (typeof window.addOverlayListener !== 'function' || typeof window.startOverlayEvents !== 'function') {
      setStatus(
        'error',
        'OverlayPlugin API unavailable',
        'common.min.js did not load or this page is not running inside OverlayPlugin.',
      );
      return;
    }

    addOverlayListener('LogLine', handleLogLine);
    addOverlayListener('ChangePrimaryPlayer', handlePrimaryPlayer);
    addOverlayListener('ChangeZone', handleChangeZone);
    startOverlayEvents();
    state.started = true;
    state.playerTimer = window.setInterval(fetchPrimaryPlayerSnapshot, config.playerSnapshotIntervalMs);
    syncView();
    setStatus('ok', 'Bridge armed', 'Waiting for filtered log lines');
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncView();
    setStatus('warn', 'Booting bridge', 'Initializing OverlayPlugin listeners');
    startBridge();
  });
})();
