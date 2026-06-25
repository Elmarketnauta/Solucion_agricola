// Developed by Marketnauta
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { isRevoked, revoke } from './blocklist';

const JWT_SECRET = process.env.JWT_SECRET || 'yunta-dev-secret-2026';

export interface AuthRequest extends Request {
  merchantPhone?: string;
}

export function extractToken(req: Request): string | null {
  // 1. httpOnly session cookie (preferred — never accessible to JS)
  const rawCookies = req.headers.cookie || '';
  for (const part of rawCookies.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === 'yunta_session') {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  // 2. Bearer header — kept for API clients, Postman, mobile native
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { phoneNumber: string; jti: string };
    if (decoded.jti && await isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Sesión cerrada' });
    }
    req.merchantPhone = decoded.phoneNumber;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function signToken(phoneNumber: string): string {
  return jwt.sign({ phoneNumber, jti: randomUUID() }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Revoca el token en el logout: persiste su JTI hasta la expiración del propio
 * JWT (así no se guarda para siempre). Async porque escribe en la BD.
 */
export async function tryRevokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { jti?: string; exp?: number };
    if (decoded.jti) {
      // `exp` viene en segundos epoch; si falta, usa el máximo (7d) por seguridad.
      const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 864e5);
      await revoke(decoded.jti, expiresAt);
    }
  } catch { /* expired/invalid — nothing to revoke */ }
}
