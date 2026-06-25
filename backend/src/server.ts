// ============================================================================
// Yunta — Backend API (Express + Prisma)
// Developed by Marketnauta
// ============================================================================

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
import { AgroCreditService } from './services/agroCredit.service';
import { MidagriService } from './services/midagri.service';
import { TelemetryService } from './services/telemetry.service';
import { CertificationService } from './services/certification.service';
import { ParametricInsuranceService } from './services/parametricInsurance.service';
import { WeatherOracleService } from './services/weatherOracle.service';
import { startCronJobs } from './cron';
import { authMiddleware, signToken, extractToken, tryRevokeToken, AuthRequest } from './middleware/auth';
import { lnetConfig, missingLnetConfig } from './config/lnet.config';

const app = express();

// ═══════════════════════════════════════
// SECURITY & MIDDLEWARE
// ═══════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production'
    ? { directives: { defaultSrc: ["'none'"] } }  // REST API — never serves resources
    : false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
  crossOriginEmbedderPolicy: false,  // SPA accesses this API cross-origin with credentials
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
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Datos inválidos' });
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
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Datos inválidos' });
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
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Datos inválidos' });
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

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  if (token) tryRevokeToken(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// ═══════════════════════════════════════
// YUNTA-AGRO ROUTES (protected)
// ═══════════════════════════════════════

// Resolve the ProducerProfile bound to the authenticated merchant. A merchant
// becomes a "producer" the first time they onboard to the agro flow; until then
// these endpoints 404 so the caller knows to register the producer first.
async function getProducerOrNull(phone: string) {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { phoneNumber: phone },
    include: { producer: true },
  });
  return merchant?.producer ?? null;
}

const producerOnboardSchema = z.object({
  dni: z.string().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos'),
});

// Onboard the authenticated merchant as an agro producer. KYC is frictionless:
// we look the DNI up in MIDAGRI's PPA — being in the padrón verifies identity
// and land tenure in a single call, no document upload.
app.post('/api/agro/onboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { dni } = producerOnboardSchema.parse(req.body);
    const phone = req.merchantPhone!;

    const merchant = await prisma.merchantProfile.findUnique({
      where: { phoneNumber: phone },
      include: { producer: true },
    });
    if (!merchant) return res.status(404).json({ error: 'Comercio no encontrado' });
    if (merchant.producer) return res.status(409).json({ error: 'Productor ya registrado' });

    const ppa = await MidagriService.lookupPadron(dni);

    const producer = await prisma.producerProfile.create({
      data: {
        merchantId: merchant.id,
        dni,
        ppaVerified: ppa.exists,
        ppaCode: ppa.ppaCode,
        hectares: ppa.hectares ?? 0,
        region: ppa.region,
        mainCrop: ppa.mainCrop,
      },
    });

    res.json({
      success: true,
      producerId: producer.id,
      ppaVerified: producer.ppaVerified,
      hectares: producer.hectares,
      region: producer.region,
      mainCrop: producer.mainCrop,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Datos inválidos' });
    // Prisma unique violation on dni/merchantId = producer already exists.
    if (error.code === 'P2002') return res.status(409).json({ error: 'Productor ya registrado' });
    console.error('[agro/onboard] internal error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al registrar productor' });
  }
});

// Recalculate the agro credit score for the authenticated producer and return
// the full breakdown + the resulting credit line. This is the core inclusion
// engine: turns identity + campaign traceability into credit capacity.
app.post('/api/agro/score', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const producer = await getProducerOrNull(req.merchantPhone!);
    if (!producer) return res.status(404).json({ error: 'Productor no encontrado. Regístrate en /api/agro/onboard' });

    const breakdown = await AgroCreditService.calculateAgroScore(producer.id);

    const merchant = await prisma.merchantProfile.findUnique({
      where: { phoneNumber: req.merchantPhone! },
      include: { creditLine: true, producer: true },
    });
    const tea = merchant?.creditLine?.interestRateEffective ?? 45;

    // Costo total del crédito (TCEA) — la cifra que la SBS exige mostrar.
    const cost = AgroCreditService.computeCreditCost(tea, breakdown.total);

    // Recomendación educativa personalizada: qué hacer para mejorar y por qué.
    const guidance = buildAgroGuidance(breakdown, merchant?.producer ?? null);

    res.json({
      success: true,
      score: breakdown,
      cost,
      guidance,
      creditLine: {
        creditLimit: merchant?.creditLine?.creditLimit ?? 0,
        interestRateEffective: tea,
        alternativeScore: merchant?.creditLine?.alternativeScore ?? 0,
      },
    });
  } catch (error: any) {
    console.error('[agro/score] internal error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al calcular el score' });
  }
});

// Genera la recomendación educativa personalizada: tramo de riesgo, próximo paso
// de mayor impacto, y mensajes que cierran la brecha financiera y tecnológica.
// Esto es lo que convierte un número (score) en un camino accionable para el
// agricultor — el corazón del flujo educativo.
function buildAgroGuidance(
  s: { total: number; ppaIdentity: number; campaignHistory: number; inputDiscipline: number; settlementFlow: number },
  producer: { ppaVerified: boolean; mainCrop: string | null } | null
) {
  // Tramo de riesgo (lenguaje de analista financiero).
  let tier: string, tierLabel: string, tierColor: string;
  if (s.total >= 750) { tier = 'A'; tierLabel = 'Sujeto de crédito preferente'; tierColor = 'green'; }
  else if (s.total >= 550) { tier = 'B'; tierLabel = 'Sujeto de crédito estándar'; tierColor = 'blue'; }
  else if (s.total >= 400) { tier = 'C'; tierLabel = 'Crédito inicial supervisado'; tierColor = 'orange'; }
  else { tier = 'D'; tierLabel = 'En construcción de historial'; tierColor = 'gray'; }

  // Próximo paso de mayor impacto (el factor con más puntos por ganar).
  const steps: { action: string; impact: number; why: string }[] = [];
  if (producer && !producer.ppaVerified) {
    steps.push({
      action: 'Inscríbete en el Padrón de Productores Agrarios (PPA) del MIDAGRI',
      impact: 350,
      why: 'Verificar tu identidad agraria y tu tenencia de tierra es el mayor salto de score posible. Es gratuito y te abre el acceso a subsidios estatales.',
    });
  }
  if (s.campaignHistory < 240) {
    steps.push({
      action: 'Registra tus cosechas en la app campaña por campaña',
      impact: 240 - s.campaignHistory,
      why: 'Cada cosecha entregada y registrada construye tu historial productivo. Es tu "estado de cuenta" agrícola: reemplaza al historial bancario que nunca tuviste.',
    });
  }
  if (s.inputDiscipline < 100) {
    steps.push({
      action: 'Compra semilla certificada y fertilizante a través de Yunta',
      impact: 100 - s.inputDiscipline,
      why: 'Comprar insumos de calidad a tiempo demuestra disciplina productiva y mejora tu rendimiento. El subsidio FertiBono puede cubrirlo.',
    });
  }
  if (s.settlementFlow < 100) {
    steps.push({
      action: 'Recibe los pagos de tus compradores en tu billetera Yunta',
      impact: 100 - s.settlementFlow,
      why: 'Cuando la agroexportadora te paga por Yunta, ese flujo prueba tus ingresos reales y baja tu tasa de interés.',
    });
  }
  steps.sort((a, b) => b.impact - a.impact);

  // Mensaje de cierre de brecha (educativo, según el tramo).
  const literacy = s.total >= 550
    ? 'Tu perfil ya es bancarizable. Usa el crédito como capital de trabajo (insumos, jornales) y págalo con tu cosecha — no para gastos de consumo.'
    : 'Estás construyendo tu identidad financiera desde cero, sin necesidad de un banco tradicional. Cada acción en la app suma a tu reputación crediticia.';

  return {
    tier, tierLabel, tierColor,
    nextSteps: steps.slice(0, 3),
    literacyMessage: literacy,
    cropContext: producer?.mainCrop
      ? `Como productor de ${producer.mainCrop}, tu campaña es estacional: el motor de Yunta no te penaliza por no tener ingresos diarios, valora tu ciclo productivo completo.`
      : null,
  };
}

// Read-only producer profile + campaign summary for the authenticated producer.
app.get('/api/agro/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const producer = await getProducerOrNull(req.merchantPhone!);
    if (!producer) return res.status(404).json({ error: 'Productor no encontrado' });

    const campaigns = await prisma.agroCampaign.findMany({
      where: { producerId: producer.id },
      orderBy: { startedAt: 'desc' },
      include: { inputs: true },
    });

    res.json({
      producerId: producer.id,
      dni: producer.dni,
      ppaVerified: producer.ppaVerified,
      hectares: producer.hectares,
      region: producer.region,
      mainCrop: producer.mainCrop,
      campaigns: campaigns.map(c => ({
        id: c.id,
        crop: c.crop,
        season: c.season,
        status: c.status,
        harvestWeightKg: c.harvestWeightKg,
        buyerName: c.buyerName,
        inputCount: c.inputs.length,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
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
// YUNTA-AGRO — CAPA PRECURSORA AGTECH (Web2 / off-chain)
// ═══════════════════════════════════════

// ── Solución 1: ingesta de telemetría IoT (M2M) ──────────────────────────────
// Optimizado para ráfagas: acepta un arreglo de lecturas en un POST. Pensado
// para nodos que acumulan offline y sincronizan en lote. Sin auth de usuario:
// los dispositivos usan una API key compartida (X-Device-Key) en producción.
const telemetrySchema = z.object({
  campaignId: z.number().int().positive(),
  readings: z.array(z.object({
    deviceId: z.string().min(1),
    soilMoisturePct: z.number().optional(),
    soilTempC: z.number().optional(),
    airTempC: z.number().optional(),
    humidityPct: z.number().optional(),
    batteryPct: z.number().optional(),
    recordedAt: z.string().optional(),
  })).min(1),
});

app.post('/api/agro/telemetry/ingest', async (req, res) => {
  try {
    // Autenticación M2M sencilla por API key de dispositivo (si está configurada).
    const deviceKey = process.env.IOT_DEVICE_KEY;
    if (deviceKey && req.headers['x-device-key'] !== deviceKey) {
      return res.status(401).json({ error: 'Dispositivo no autorizado' });
    }
    const { campaignId, readings } = telemetrySchema.parse(req.body);
    const result = await TelemetryService.ingestBurst(campaignId, readings);
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Datos inválidos' });
    if (/no encontrada/i.test(error.message)) return res.status(404).json({ error: error.message });
    console.error('[telemetry/ingest] error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al ingerir telemetría' });
  }
});

// Alertas activas de una campaña (para el dashboard del productor).
app.get('/api/agro/telemetry/:campaignId/alerts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isInteger(campaignId)) return res.status(400).json({ error: 'campaignId inválido' });
    const alerts = await TelemetryService.activeAlerts(campaignId);
    res.json({ success: true, alerts });
  } catch (error: any) {
    console.error('[telemetry/alerts] error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al consultar alertas' });
  }
});

// Mapea una región del productor a la estación del oráculo más cercana.
function stationForRegion(region: string | null): string {
  const map: Record<string, string> = {
    Cusco: 'cusco-quispicanchi', Puno: 'puno-azangaro', Cajamarca: 'cajamarca-celendin',
    'San Martín': 'sanmartin-moyobamba', Junín: 'junin-chanchamayo',
  };
  return map[region ?? ''] ?? WeatherOracleService.stations()[0];
}

// Serie temporal de telemetría (sparklines + estadísticos) + última lectura del
// oráculo climático para la estación del productor. Alimenta el Centro Agronómico
// con TENDENCIAS reales, no valores puntuales.
app.get('/api/agro/telemetry/:campaignId/series', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isInteger(campaignId)) return res.status(400).json({ error: 'campaignId inválido' });

    const producer = await getProducerOrNull(req.merchantPhone!);
    const stationKey = stationForRegion(producer?.region ?? null);

    const [series, oracle] = await Promise.all([
      TelemetryService.getSeries(campaignId),
      WeatherOracleService.latestForStation(stationKey),
    ]);

    res.json({
      success: true,
      series,
      oracle: oracle ? {
        stationKey: oracle.stationKey,
        date: oracle.date,
        tempMaxC: oracle.tempMaxC,
        tempMinC: oracle.tempMinC,
        tempAvgC: oracle.tempAvgC,
        precipitationMm: oracle.precipitationMm,
        humidityPct: oracle.humidityPct,
        payloadHash: oracle.payloadHash,
        source: oracle.source,
      } : null,
    });
  } catch (error: any) {
    console.error('[telemetry/series] error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al consultar la serie de telemetría' });
  }
});

// ── Solución 5: emisión de certificado/pasaporte EUDR ────────────────────────
const certifySchema = z.object({
  campaignId: z.number().int().positive(),
  buyerRuc: z.string().regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos'),
  taxYear: z.number().int().min(2020).max(2100),
  deductiblePct: z.number().min(0).max(1).optional(),
});

app.post('/api/agro/certification/issue', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const input = certifySchema.parse(req.body);
    const passport = await CertificationService.issue(input);
    res.json({ success: true, ...passport });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Datos inválidos' });
    if (/no encontrada|no tiene cosecha|no está verificado/i.test(error.message)) {
      return res.status(422).json({ error: error.message });
    }
    console.error('[certification/issue] error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al emitir certificación' });
  }
});

// Verificación PÚBLICA del pasaporte por un auditor/comprador (sin auth).
// Recalcula el hash y reporta si el lote fue manipulado (integrity).
app.get('/api/agro/certification/:certUuid', async (req, res) => {
  try {
    const passport = await CertificationService.verifyByUuid(req.params.certUuid);
    if (!passport) return res.status(404).json({ error: 'Certificado no encontrado' });
    res.json({ success: true, passport });
  } catch (error: any) {
    console.error('[certification/verify] error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al verificar certificación' });
  }
});

// ── Ops: disparar el ciclo AgTech manualmente (oráculo + seguros) ────────────
// Útil para demos y para forzar la evaluación sin esperar al cron. Protegido por
// API key de operaciones (X-Ops-Key) si está configurada.
app.post('/api/agro/ops/run-cycle', async (req, res) => {
  try {
    const opsKey = process.env.OPS_KEY;
    if (opsKey && req.headers['x-ops-key'] !== opsKey) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const oracleReadings = await WeatherOracleService.refreshAll();
    const insurance = await ParametricInsuranceService.evaluateActivePolicies();
    res.json({ success: true, oracleReadings, insurance });
  } catch (error: any) {
    console.error('[ops/run-cycle] error:', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Error al ejecutar el ciclo AgTech' });
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

  // Estado de la capa Web3/Lnet (Fase 3). NO conecta a la blockchain: solo
  // informa si la configuración está lista. Mientras esté deshabilitada, el
  // MVP corre 100% fiat. Ver src/config/lnet.config.ts y .env.web3.example.
  if (!lnetConfig.enabled) {
    console.log('ℹ️  Lnet/Web3: deshabilitado (modo fiat). Para activar: LNET_ENABLED=true + .env.web3.example');
  } else {
    const missing = missingLnetConfig();
    if (missing.length) {
      console.warn(`⚠️  Lnet/Web3: HABILITADO pero faltan variables: ${missing.join(', ')}. Ver .env.web3.example`);
    } else {
      console.log('🔗 Lnet/Web3: configuración completa. El listener se conectará en Fase 3 (requiere `npm i ethers`).');
    }
  }

  // Capa Precursora AgTech: oráculo climático + motor de seguros paramétricos.
  startCronJobs();
});
