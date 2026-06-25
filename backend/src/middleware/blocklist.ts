// Developed by Marketnauta
// In-memory JTI blocklist for token revocation.
// Entries survive until the process restarts — sufficient for MVP.
// Production: replace with a Redis SET + TTL matching the JWT expiry (7d).
const revoked = new Set<string>();

export function revoke(jti: string): void {
  revoked.add(jti);
}

export function isRevoked(jti: string): boolean {
  return revoked.has(jti);
}
