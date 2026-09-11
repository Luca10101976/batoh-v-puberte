/**
 * R43: kdy se smí serverová hodnota promítnout do klientského stavu.
 *
 * Přehled profilu i kanonický profil od R43 rozlišují dvě různé věci:
 *   - skutečnou nulu / skutečně prázdný seznam, které se synchronizují normálně,
 *   - `null`, které znamená „server to nezjistil" (výpadek databáze, chyba čtení).
 *
 * Dřív se obojí posílalo stejně – jako 0 a []. Hráč pak při výpadku viděl
 * „Body: 0" a „žádní kamarádi" jako fakt a klient tím přepsal i lokálně uložený
 * stav. Tyhle dvě funkce drží to rozhodnutí na jednom místě, aby šlo ověřit
 * testem a nemuselo se opakovat v každé obrazovce.
 */

/** Smí se tahle číselná hodnota ze serveru zapsat do stavu? */
export function shouldApplyServerNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Smí se tenhle seznam ze serveru zapsat do stavu? */
export function shouldApplyServerList<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value);
}
