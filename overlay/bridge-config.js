window.HuntBridgeConfig = {
  endpoint: 'http://127.0.0.1:5059/ingest',
  lineCodes: ['03', '04', '25', '40', '261'],
  flushIntervalMs: 350,
  maxBatchSize: 32,
  playerSnapshotIntervalMs: 2000,
  overlayName: 'hunt-ingest-bridge',
  debug: false,
};
