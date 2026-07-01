/**
 * Curated timezone picker (Plan 025). A short list of IANA zones with Russian
 * labels, offered during onboarding (`ob:tz:<i>`) and in ⚙️ Настройки
 * (`set:tz:<i>`). We store IANA names — never raw UTC offsets — so daylight
 * saving is handled correctly by `Intl` (e.g. `Europe/Belgrade` follows
 * CET↔CEST). Callbacks reference the list **index**, not the id, so payloads
 * stay far under the 64-byte `callback_data` cap.
 *
 * `Europe/Belgrade` (CET) is first — the current audience default, matching the
 * bot-global `config.timezone` default.
 */

export interface TimezoneOption {
  /** IANA zone name — the value persisted to the user's `timezone` setting. */
  readonly id: string;
  /** Russian button / label text. */
  readonly label: string;
}

export const TIMEZONES: readonly TimezoneOption[] = [
  // Europe (audience default first). Several CET cities are listed by name so
  // users pick their own city; the IANA id makes them equivalent + DST-correct.
  { id: 'Europe/Belgrade', label: 'Белград (CET)' },
  { id: 'Europe/Berlin', label: 'Берлин' },
  { id: 'Europe/Paris', label: 'Париж' },
  { id: 'Europe/Madrid', label: 'Мадрид' },
  { id: 'Europe/Rome', label: 'Рим' },
  { id: 'Europe/London', label: 'Лондон' },
  { id: 'Europe/Lisbon', label: 'Лиссабон' },
  { id: 'Europe/Athens', label: 'Афины' },
  { id: 'Europe/Kyiv', label: 'Киев' },
  { id: 'Europe/Moscow', label: 'Москва' },
  // North America (Russian region hints — offsets shift with DST, so no fixed number).
  { id: 'America/New_York', label: 'Нью-Йорк (восточное)' },
  { id: 'America/Chicago', label: 'Чикаго (центральное)' },
  { id: 'America/Denver', label: 'Денвер (горное)' },
  { id: 'America/Los_Angeles', label: 'Лос-Анджелес (тихоокеанское)' },
  // Caucasus / Central Asia / SE Asia.
  { id: 'Asia/Yerevan', label: 'Ереван' },
  { id: 'Asia/Tbilisi', label: 'Тбилиси' },
  { id: 'Asia/Almaty', label: 'Алматы' },
  { id: 'Asia/Bangkok', label: 'Бангкок' },
  { id: 'UTC', label: 'UTC' },
];

/**
 * Russian label for a stored IANA id, falling back to the raw id when the zone
 * isn't in the curated list (defensive — a value can only enter via the list).
 */
export function timezoneLabel(id: string): string {
  return TIMEZONES.find((t) => t.id === id)?.label ?? id;
}
