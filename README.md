# FFXIV Hunt Notifier Prototype

Minimal prototype for:

- detecting A/S hunt sightings
- testing with arbitrary tracked targets before live hunt validation
- separating A/S records
- storing raw world coordinates and player-facing map coordinates
- rendering a pin image
- sending a Discord webhook

This prototype is intentionally dependency-free and runs on the Node.js built-ins that are already available on this machine.

## What This Prototype Does

The service accepts either:

- raw ACT/OverlayPlugin log lines via `POST /ingest`
- already-normalized spawn events via `POST /simulate/spawn`

When a hunt match is found, it:

1. resolves the hunt rank and metadata from a hunt table
2. converts world coordinates into map coordinates with a per-map calibration
3. appends a JSONL record to disk
4. renders a map-pin PNG
5. writes the PNG to disk for local inspection
6. sends the record to a Discord webhook

## Why World And Map Coordinates Are Both Stored

- `worldX/worldY/worldZ`: raw game position for machine processing and dedupe
- `mapX/mapY`: player-facing coordinates for Discord text and map pin placement

## Files

- `src/server.mjs`: HTTP entrypoint
- `src/lib/parser.mjs`: raw log parsing helpers
- `src/lib/projector.mjs`: world-to-map and world-to-pixel conversion
- `src/lib/png-renderer.mjs`: PNG pin image generation
- `src/lib/discord.mjs`: Discord webhook delivery
- `src/lib/store.mjs`: JSONL record storage
- `config/example.config.json`: example runtime config
- `config/local.config.example.json`: GitHub-safe local runtime template for real ACT usage
- `config/hunts.sample.json`: sample hunt table
- `config/hunts.as-whitelist.json`: A/S BNpcNameID whitelist for live hunt detection
- `config/tracked-targets.outrunner.json`: real-log-based tracked target file for Outrunner
- `maps/sample-grid.svg`: sample background image
- `maps/official/*.png`: downloaded official Dawntrail zone maps for background pin rendering
- `overlay/ingest-bridge.html`: OverlayPlugin custom overlay that forwards live log lines to the local server
- `samples/simulated_spawn.json`: sample event for local verification
- `samples/simulated_test_target.json`: sample non-hunt target event for local verification
- `samples/ingest-outrunner-remove.json`: raw-log ingest sample based on the provided Outrunner log

## Run

Before using the local ACT bridge scripts, copy:

```powershell
Copy-Item config/local.config.example.json config/local.config.json
```

Then edit `config/local.config.json` and fill in:

- `identity.detectedBy`
- `discord.webhookUrl`

```powershell
node src/server.mjs --config config/example.config.json --hunts config/hunts.sample.json
```

For the local Discord test setup used in this workspace:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restart-local-server.ps1
```

Start the live A/S whitelist setup:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restart-live-server.ps1
```

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:5055/health | Select-Object -Expand Content
```

Local debug state:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/debug-local-state.ps1
```

Download the official Dawntrail zone backgrounds:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-official-dawntrail-maps.ps1
```

Build a map calibration snippet from two known points:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/calibrate-map.ps1 `
  -MapId 862 `
  -ZoneName "Living Memory" `
  -WorldX1 -324.95 `
  -WorldZ1 36.56 `
  -MapX1 22.0 `
  -MapY1 37.5 `
  -WorldX2 -450.19 `
  -WorldZ2 34.91 `
  -MapX2 14.6 `
  -MapY2 35.9
```

Simulate a hunt spawn:

```powershell
Invoke-WebRequest http://127.0.0.1:5055/simulate/spawn `
  -Method POST `
  -ContentType 'application/json' `
  -InFile samples/simulated_spawn.json
```

Simulate a non-hunt test target:

```powershell
Invoke-WebRequest http://127.0.0.1:5055/simulate/spawn `
  -Method POST `
  -ContentType 'application/json' `
  -InFile samples/simulated_test_target.json
```

Test with the real Outrunner log sample:

```powershell
node src/server.mjs --config config/local.config.json --hunts config/tracked-targets.outrunner.json
```

```powershell
Invoke-WebRequest http://127.0.0.1:5059/ingest `
  -Method POST `
  -ContentType 'application/json' `
  -InFile samples/ingest-outrunner-remove.json
```

## Config Notes

The prototype is wired around calibration instead of hardcoding FFXIV-specific map formulas.

Each map entry defines:

- raw world-space bounds
- display map coordinate bounds
- pixel bounds for pin placement inside the map image

That makes the prototype usable immediately, and later you can swap the calibration layer for exact map metadata from game data if you want.

Relative paths in the example config are resolved from the `config/` folder, not the workspace root.

If `imagePath` is configured for a map, the renderer composites the pin onto the real zone background image.
If no local background asset is available, it falls back to the tactical grid preview.

## Testing With Another Target

You do not need a real hunt for end-to-end validation.

Add a normal tracked entry to `config/hunts.sample.json` or your local copy with:

- `category: "test"`
- `rank: null`
- `alertLabel: "테스트 감지"`
- either `name`, `aliases`, `bnpcNameIds`, or `bnpcIds`

That lets you test the same Discord + image pipeline against any ordinary mob or NPC that is easy to find in game.

If you already have a real log sample, it is cleaner to keep those temporary targets in a separate file such as `config/tracked-targets.outrunner.json` and launch with `--hunts`.

## Live A/S Whitelist Mode

`config/hunts.as-whitelist.json` uses two generic hunt entries:

- one `A` rank whitelist
- one `S` rank whitelist

When a matching BNpcNameID is seen, the alert rank comes from the whitelist and the displayed mob name comes from the live log line itself.
That means you do not need a per-mob name table just to get useful Discord alerts.

## Raw Log Parsing Notes

The parser is built so that the line code (`03`, `04`, `40`, `261`) is found first, then all configured indexes are applied relative to that code field.
`261` is parsed dynamically from key/value pairs such as `PosX|...|PosY|...|PosZ|...`, based on the real sample log format.
`03`, `04`, `25`, and `40` are currently mapped for the raw ACT line shape seen in testing, with `40` supplying the runtime `mapId`.

## OverlayPlugin Integration

The cleanest live integration is:

1. a lightweight OverlayPlugin custom overlay listens for `LogLine`
2. it forwards the raw lines to `POST /ingest`
3. this Node service handles matching, storage, rendering, and Discord delivery

That keeps the Discord webhook and image generation out of the overlay runtime.

### Local Bridge Overlay

This workspace now includes a ready-to-load custom overlay:

- `C:\Users\Administrator\Desktop\ffxiv_mamul_codex\overlay\ingest-bridge.html`

To use it in ACT / OverlayPlugin:

1. Start the Node service first.
2. In ACT, go to `Plugins -> OverlayPlugin.dll -> New`.
3. Choose `Custom` and use a `MiniParse`-type overlay.
4. Set the URL to:
   `file:///C:/Users/Administrator/Desktop/ffxiv_mamul_codex/overlay/ingest-bridge.html`
5. Keep the bridge overlay small on screen while testing, or move it aside after it shows `Bridge armed`.

The bridge listens for the official OverlayPlugin `LogLine`, `ChangePrimaryPlayer`, and `ChangeZone` events through `common.min.js`, then batches line codes `03`, `04`, `25`, `40`, and `261` to the local ingest server.

The endpoint and line-code filter live in `overlay/bridge-config.js`.

If map coordinates show as unavailable, check `http://127.0.0.1:5059/debug/state` first.
That route shows the last seen `mapId`, current zone, and whether that map currently has a calibration entry in `config/local.config.json`.
