/**
 * Invoice payload (de)serialization. The payload round-trips through Telegram
 * on the `successful_payment` callback, so it must encode everything we need to
 * record the donation without a server-side session.
 */

const PREFIX = 'donate';

export function buildDonationPayload(tierId: string): string {
  return `${PREFIX}:${tierId}`;
}

export function parseDonationPayload(payload: string): { tierId: string } | null {
  const parts = payload.split(':');
  if (parts.length !== 2 || parts[0] !== PREFIX) return null;
  const tierId = parts[1];
  return tierId ? { tierId } : null;
}
