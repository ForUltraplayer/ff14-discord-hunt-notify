function isConfiguredWebhook(url) {
  return typeof url === 'string' && url.startsWith('https://discord.com/api/webhooks/') && !url.includes('/replace/');
}

function buildHeadline(record) {
  if (record.rank === 'A' || record.rank === 'S') {
    return `[${record.rank}급 발견] ${record.mobName}`;
  }

  return `[${record.alertLabel ?? '대상 감지'}] ${record.mobName}`;
}

function resolveEmbedColor(record) {
  if (record.rank === 'S') {
    return 14565934;
  }

  if (record.rank === 'A') {
    return 15810157;
  }

  return 5025616;
}

function buildMapSummary(record) {
  if (record.map) {
    return `X ${record.map.x.toFixed(1)} / Y ${record.map.y.toFixed(1)}`;
  }

  if (record.mapId) {
    return `Unmapped (${record.mapId})`;
  }

  return 'Unavailable';
}

export async function sendDiscordWebhook(webhookUrl, record, imageBuffer) {
  if (!isConfiguredWebhook(webhookUrl)) {
    return { delivered: false, reason: 'webhook-not-configured' };
  }

  const content = [
    buildHeadline(record),
    `지역: ${record.zoneName ?? 'Unknown'}${record.instanceLabel ? ` ${record.instanceLabel}인스턴스` : ''}`,
    record.map
      ? `좌표: X ${record.map.x.toFixed(1)} / Y ${record.map.y.toFixed(1)}`
      : `좌표: unavailable${record.mapId ? ` (맵 미설정: ${record.mapId})` : ''}`,
    `감지: ${record.detectedBy ?? 'unknown'}`,
  ].join('\n');

  const payload = {
    content,
    embeds: [
      {
        title: record.rank ? `${record.mobName} (${record.rank} Rank)` : record.mobName,
        description: record.placeName ?? record.zoneName ?? 'Unknown place',
        color: resolveEmbedColor(record),
        fields: [
          {
            name: 'Type',
            value: record.rank ? `${record.rank} Rank Hunt` : record.alertLabel ?? 'Tracked Target',
            inline: true,
          },
          {
            name: 'Map',
            value: buildMapSummary(record),
            inline: true,
          },
          {
            name: 'World',
            value: `(${record.world.x}, ${record.world.y}, ${record.world.z})`,
            inline: true,
          },
          {
            name: 'Detected By',
            value: record.detectedBy ?? 'unknown',
            inline: false,
          },
        ],
        image: {
          url: 'attachment://hunt-map.png',
        },
        timestamp: record.detectedAt,
      },
    ],
  };

  const form = new FormData();
  form.set('payload_json', JSON.stringify(payload));
  form.set('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'hunt-map.png');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${errorText}`);
  }

  return { delivered: true };
}
