import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from './db';
import { InteroperabilityService } from './services/interoperability.service';
import { LedgerService } from './services/ledger.service';
import { authMiddleware, signToken, AuthRequest } from './middleware/auth';

const app = express();

// ═══════════════════════════════════════
// SECURITY & MIDDLEWARE
// ═══════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN ?? false)
    : /^http:\/\/localhost(:\d+)?$/,
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

// Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Demasiadas peticiones, intenta más tarde.' }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 requests per windowMs (Brute-force protection)
  message: { error: 'Demasiados intentos de acceso fallidos, intenta en 1 hora.' }
});

// Prevent phone-number enumeration: an authenticated attacker could harvest
// businessName + ownerName for every Peruvian mobile number sequentially.
const validateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Demasiadas búsquedas, intenta más tarde.' }
});

// Zod Schemas
const registerSchema = z.object({
  businessName: z.string().min(2).max(100),
  ownerName: z.string().min(2).max(100),
  phoneNumber: z.string().regex(/^\+51\d{9}$/, 'Formato de teléfono inválido'),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe ser de 4 dígitos')
});

const loginSchema = z.object({
  phoneNumber: z.string().regex(/^\+51\d{9}$/, 'Formato de teléfono inválido'),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe ser de 4 dígitos')
});

const transferSchema = z.object({
  receiverPhone: z.string().regex(/^\+51\d{9}$/, 'Formato de teléfono inválido'),
  amount: z.number().positive().max(10000, 'Monto máximo S/ 10,000').min(0.1, 'Monto mínimo S/ 0.10'),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe ser de 4 dígitos')
});

const SESSION_COOKIE = 'yunta_session';
const cookieOpts = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ═══════════════════════════════════════
// AUTH ROUTES (public)
// ═══════════════════════════════════════

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.merchantProfile.findUnique({ where: { phoneNumber: data.phoneNumber } });
    if (existing) return res.status(400).json({ error: 'Este número ya está registrado' });

    const hashedPin = await bcrypt.hash(data.pin, 10);
    const merchant = await prisma.merchantProfile.create({
      data: {
        businessName: data.businessName,
        ownerName: data.ownerName,
        phoneNumber: data.phoneNumber,
        pin: hashedPin,
        wallet: { create: { balance: 0 } },
        creditLine: { create: { creditLimit: 500, interestRateEffective: 15.5 } }
      }
    });

    const token = signToken(data.phoneNumber);
    res.cookie(SESSION_COOKIE, token, cookieOpts);
    res.json({ success: true, merchant: { id: merchant.id, businessName: merchant.businessName, ownerName: merchant.ownerName, phoneNumber: merchant.phoneNumber } });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: (error as any).errors[0].message });
    console.error('[register] internal error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const merchant = await prisma.merchantProfile.findUnique({ where: { phoneNumber: data.phoneNumber } });
    if (!merchant) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (!merchant.pin) return res.status(400).json({ error: 'Cuenta sin PIN configurado.' });

    const valid = await bcrypt.compare(data.pin, merchant.pin);
    if (!valid) return res.status(401).json({ error: 'PIN incorrecto' });

    const token = signToken(data.phoneNumber);
    res.cookie(SESSION_COOKIE, token, cookieOpts);
    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        ownerName: merchant.ownerName,
        phoneNumber: merchant.phoneNumber,
        status: merchant.status
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: (error as any).errors[0].message });
    console.error('[login] internal error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════
// PROTECTED ROUTES
// ═══════════════════════════════════════

app.get('/api/merchant/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const merchant = await prisma.merchantProfile.findUnique({
      where: { phoneNumber: req.merchantPhone },
      include: { wallet: true, creditLine: true }
    });
    if (!merchant) return res.status(404).json({ error: 'Comercio no encontrado' });

    res.json({
      ownerName: merchant.ownerName,
      businessName: merchant.businessName,
      phoneNumber: merchant.phoneNumber,
      balance: merchant.wallet?.balance || 0,
      creditLimit: merchant.creditLine?.creditLimit || 0,
      alternativeScore: merchant.creditLine?.alternativeScore || 0,
      status: merchant.status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/api/merchant/transactions', authMiddleware, async (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const skip = (page - 1) * limit;
  const phone = req.merchantPhone!;

  try {
    const [txs, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { OR: [{ senderPhone: phone }, { receiverPhone: phone }] },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.transaction.count({
        where: { OR: [{ senderPhone: phone }, { receiverPhone: phone }] }
      })
    ]);

    // Enrich each transaction with the counterparty business name so the UI
    // can show "Bodega Doña Rosa" instead of a raw phone number.
    const phones = [...new Set(
      txs.flatMap(t => [t.senderPhone, t.receiverPhone]).filter(Boolean)
    )] as string[];
    const merchants = await prisma.merchantProfile.findMany({
      where: { phoneNumber: { in: phones } },
      select: { phoneNumber: true, businessName: true }
    });
    const nameMap = new Map(merchants.map(m => [m.phoneNumber, m.businessName]));
    const enriched = txs.map(t => ({
      ...t,
      senderName: t.senderPhone ? (nameMap.get(t.senderPhone) ?? null) : null,
      receiverName: t.receiverPhone ? (nameMap.get(t.receiverPhone) ?? null) : null,
    }));

    res.json({ transactions: enriched, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/transfer', authMiddleware, async (req: AuthRequest, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) return res.status(400).json({ error: 'Idempotency-Key requerido' });

  try {
    const data = transferSchema.parse(req.body);
    const senderPhone = req.merchantPhone!;

    // Verify PIN before transfer
    const sender = await prisma.merchantProfile.findUnique({ where: { phoneNumber: senderPhone } });
    if (!sender || !sender.pin) return res.status(400).json({ error: 'Cuenta inválida' });

    const validPin = await bcrypt.compare(data.pin, sender.pin);
    if (!validPin) return res.status(401).json({ error: 'PIN incorrecto' });

    // Idempotency is enforced atomically inside the ledger via the txSignature
    // @unique constraint — no in-memory lock (lost on restart, not multi-instance).
    const tx = await LedgerService.processInternalPayment(senderPhone, data.receiverPhone, data.amount, idempotencyKey);

    // Get updated balance
    const updatedSender = await prisma.merchantProfile.findUnique({
      where: { phoneNumber: senderPhone },
      include: { wallet: true }
    });

    res.json({
      success: true,
      txId: tx.id,
      amount: tx.amount,
      receiverPhone: tx.receiverPhone,
      newBalance: updatedSender?.wallet?.balance || 0,
      timestamp: tx.createdAt
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: (error as any).errors[0].message });
    // Prisma unique violation on txSignature = replayed / duplicate request.
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Transacción ya procesada (Doble gasto prevenido)' });
    }
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/transfer/validate', authMiddleware, validateLimiter, async (req: AuthRequest, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Número requerido' });

  try {
    const merchant = await prisma.merchantProfile.findUnique({
      where: { phoneNumber },
      select: { businessName: true, ownerName: true }
    });
    if (!merchant) return res.status(404).json({ error: 'Destinatario no encontrado' });

    // Return only what the payer UI needs: business name (public-facing)
    // and a masked owner name (first name + initial) to confirm identity
    // without exposing full PII to a potential enumerator.
    const [firstName, ...rest] = merchant.ownerName.trim().split(' ');
    const maskedName = rest.length > 0 ? `${firstName} ${rest[rest.length - 1][0]}.` : firstName;

    res.json({ exists: true, businessName: merchant.businessName, ownerName: maskedName });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// ═══════════════════════════════════════
// WEBHOOK ROUTES (external)
// ═══════════════════════════════════════

// Fail-fast at startup: without this secret, incoming interoperable payments
// could be forged (attacker credits arbitrary accounts at will).
if (!process.env.WEBHOOK_SECRET) {
  console.error('FATAL: WEBHOOK_SECRET env var is not set. Refusing to start.');
  process.exit(1);
}
// TypeScript can't narrow through process.exit(), so we extract after the guard.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET as string;

function verifyHmacSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-cce-signature'] as string;
  if (!signature) return res.status(401).json({ error: 'Firma requerida' });

  const payload = JSON.stringify(req.body);
  const expectedHex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

  // Use constant-time comparison to prevent timing attacks that could reveal
  // the secret byte-by-byte via response latency differences.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedHex);
  const signaturesMatch =
    sigBuf.length === expBuf.length &&
    crypto.timingSafeEqual(sigBuf, expBuf);

  if (!signaturesMatch) {
    return res.status(403).json({ error: 'Firma inválida - Acceso Denegado' });
  }
  next();
}

app.post('/api/webhook/interoperable', verifyHmacSignature, async (req, res) => {
  try {
    const result = await InteroperabilityService.handleIncomingWebhook(req.body);
    res.json(result);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Yunta Backend Server running on http://localhost:${PORT}`);
});
