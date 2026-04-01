export function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function hashPin(pin: string) {
  const input = `pan-batoh:${normalizePin(pin)}`;
  let hash = 0;

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  return String(hash);
}
