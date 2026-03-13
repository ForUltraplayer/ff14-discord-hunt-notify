function normalizedText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function isLikelyCombatantEntityId(value) {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();

  return text.startsWith('4');
}

export function findMatchingHunt(hunts, event) {
  const name = normalizedText(event.name ?? event.hunt?.name);
  const bnpcNameId = Number(event.bnpcNameId ?? event.hunt?.bnpcNameId);
  const bnpcId = Number(event.bnpcId ?? event.hunt?.bnpcId);
  const key = normalizedText(event.hunt?.key);
  const isCombatantEntity = isLikelyCombatantEntityId(event.entityId);

  return (
    hunts.find((hunt) => {
      if (key && normalizedText(hunt.key) === key) {
        return true;
      }

      if (Number.isFinite(bnpcNameId) && (hunt.bnpcNameIds ?? []).includes(bnpcNameId)) {
        return true;
      }

      if (Number.isFinite(bnpcId) && (hunt.bnpcIds ?? []).includes(bnpcId)) {
        return true;
      }

      if (name && isCombatantEntity && normalizedText(hunt.name) === name) {
        return true;
      }

      return isCombatantEntity && (hunt.aliases ?? []).some((alias) => normalizedText(alias) === name);
    }) ?? null
  );
}
