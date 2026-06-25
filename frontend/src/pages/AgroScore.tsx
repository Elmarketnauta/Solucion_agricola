// ============================================================================
// Yunta-Agro — Vista del Score Agro (analista financiero + flujo educativo).
// Developed by Marketnauta
// ============================================================================

import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// ── Tipos del payload de /api/agro/score ────────────────────────────────────
interface ScoreBreakdown {
  total: number; base: number; ppaIdentity: number; ppaCapacity: number;
  campaignHistory: number; inputDiscipline: number; settlementFlow: number;
}
interface CostBreakdown {
  tea: number; tcea: number;
  components: { interestTea: number; adminCommission: number; disbursementFee: number; parametricInsurance: number };
}
interface Guidance {
  tier: string; tierLabel: string; tierColor: string;
  nextSteps: { action: string; impact: number; why: string }[];
  literacyMessage: string; cropContext: string | null;
}
interface AgroScoreResponse {
  success: boolean;
  score: ScoreBreakdown;
  cost: CostBreakdown;
  guidance: Guidance;
  creditLine: { creditLimit: number; interestRateEffective: number; alternativeScore: number };
}

// Etiquetas legibles de cada factor del score, con su tope, para que el analista
// (y el agricultor) vean cuánto pesa cada palanca.
const FACTORS: { key: keyof ScoreBreakdown; label: string; max: number; hint: string }[] = [
  { key: 'base',            label: 'Registro base',            max: 300, hint: 'Puntaje inicial por crear tu cuenta.' },
  { key: 'ppaIdentity',     label: 'Identidad agraria (PPA)',  max: 200, hint: 'Verificación en el Padrón de Productores del MIDAGRI.' },
  { key: 'ppaCapacity',     label: 'Capacidad productiva',     max: 150, hint: 'Proxy según hectáreas verificadas.' },
  { key: 'campaignHistory', label: 'Historial de campañas',    max: 320, hint: 'Cosechas registradas y entregadas.' },
  { key: 'inputDiscipline', label: 'Disciplina de insumos',    max: 130, hint: 'Compra de semilla y fertilizante a tiempo.' },
  { key: 'settlementFlow',  label: 'Flujo de cobros',          max: 100, hint: 'Pagos recibidos por la billetera Yunta.' },
];

const TIER_BG: Record<string, string> = {
  green: 'bg-green-50 border-green-200 text-green-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  gray: 'bg-gray-100 border-gray-200 text-gray-700',
};

function money(n: number) {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AgroScore() {
  const navigate = useNavigate();
  const [data, setData] = useState<AgroScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsOnboard, setNeedsOnboard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.agroScore();
      setData(res);
    } catch (e: any) {
      // 404 = aún no es productor: ofrecemos el onboarding.
      if (/no encontrado/i.test(e.message)) setNeedsOnboard(true);
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="animate-fade">
        <div className="skeleton skeleton-text mb-md" />
        <div className="card mb-lg"><div className="skeleton skeleton-amount" /></div>
        <div className="card"><div className="skeleton skeleton-text mb-sm" /><div className="skeleton skeleton-text" /></div>
      </div>
    );
  }

  if (needsOnboard) {
    return <OnboardPrompt onDone={load} />;
  }

  if (error || !data) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📡</div>
        <p className="text-muted">{error ?? 'No se pudo cargar tu score agro'}</p>
        <button className="btn btn-primary mt-lg" onClick={load}>Reintentar</button>
      </div>
    );
  }

  const { score, cost, guidance, creditLine } = data;
  const pct = Math.round((score.total / 1000) * 100);

  return (
    <div
      className="animate-in"
      data-testid="agro-score"
      data-agro-score={score.total}
      data-agro-tier={guidance.tier}
      data-agro-tcea={cost.tcea}
      data-agro-credit={creditLine.creditLimit}
    >
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>⬅️ Volver</button>
        <h1 className="text-xl font-bold m-0">Score Agro · Yunta-Agro</h1>
      </header>

      {/* ── Hero: score + tramo de riesgo ─────────────────────────────── */}
      <div className="card mb-lg">
        <div className="flex items-center justify-between mb-sm">
          <h2 className="text-lg font-semibold m-0">Tu puntaje crediticio agrícola</h2>
          <span className={`badge ${score.total >= 550 ? 'badge-success' : 'badge-warning'}`}>Tramo {guidance.tier}</span>
        </div>
        <div className="flex items-end gap-md mb-sm">
          <div className="text-3xl font-bold">{score.total}</div>
          <div className="text-muted mb-xs">/ 1000</div>
        </div>
        <div className="bg-gray-200 h-2 rounded-full overflow-hidden mb-sm">
          <div className="bg-primary h-full" style={{ width: `${pct}%`, transition: 'width .6s ease' }} />
        </div>
        <div className={`p-md rounded-md border ${TIER_BG[guidance.tierColor] ?? TIER_BG.gray}`}>
          <strong>{guidance.tierLabel}</strong>
          {guidance.cropContext && <p className="text-sm m-0 mt-sm">{guidance.cropContext}</p>}
        </div>
      </div>

      {/* ── Panel del analista: oferta de crédito + TCEA desglosada ────── */}
      <div className="card mb-lg">
        <h3 className="text-lg font-semibold mb-md">Oferta de crédito y costo total (TCEA)</h3>
        <div className="grid-2 mb-md">
          <div className="stat-box">
            <div className="stat-label">Línea pre-aprobada</div>
            <div className="stat-value">S/ {money(creditLine.creditLimit)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">TCEA (costo total anual)</div>
            <div className="stat-value">{cost.tcea}%</div>
          </div>
        </div>

        {/* Desglose de la TCEA — exactamente lo que exige la SBS mostrar */}
        <table className="cost-table">
          <tbody>
            <tr><td>Interés (TEA)</td><td className="text-right">{cost.components.interestTea}%</td></tr>
            <tr><td>Comisión administrativa</td><td className="text-right">+{cost.components.adminCommission}%</td></tr>
            <tr><td>Portes y desembolso</td><td className="text-right">+{cost.components.disbursementFee}%</td></tr>
            <tr><td>Seguro paramétrico climático</td><td className="text-right">+{cost.components.parametricInsurance}%</td></tr>
            <tr className="cost-total"><td><strong>TCEA</strong></td><td className="text-right"><strong>{cost.tcea}%</strong></td></tr>
          </tbody>
        </table>
        <p className="text-muted text-sm mt-sm">
          La TCEA refleja el costo <strong>total</strong> del crédito (interés + comisiones + seguro), compuesto
          según la metodología de la SBS. Es la cifra que debes comparar entre ofertas, no solo la TEA.
        </p>
      </div>

      {/* ── Desglose del score: cada palanca y cuánto pesa ─────────────── */}
      <div className="card mb-lg">
        <h3 className="text-lg font-semibold mb-md">¿Cómo se construye tu puntaje?</h3>
        <div className="factor-list">
          {FACTORS.map(f => {
            const val = score[f.key];
            const fpct = Math.round((val / f.max) * 100);
            return (
              <div key={f.key} className="factor-row">
                <div className="factor-head">
                  <span className="factor-label">{f.label}</span>
                  <span className="factor-val">{val} <span className="text-muted">/ {f.max}</span></span>
                </div>
                <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div className={`h-full ${val > 0 ? 'bg-primary' : ''}`} style={{ width: `${fpct}%` }} />
                </div>
                <div className="factor-hint text-muted text-sm">{f.hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Flujo educativo: próximos pasos personalizados ─────────────── */}
      <div className="card mb-lg">
        <h3 className="text-lg font-semibold mb-sm">Tu plan para mejorar 📈</h3>
        <p className="text-muted text-sm mb-md">{guidance.literacyMessage}</p>
        {guidance.nextSteps.length === 0 ? (
          <div className="bg-green-50 p-md rounded-md border border-green-200 text-green-800">
            🎉 ¡Felicitaciones! Has maximizado tu puntaje. Mantén tu actividad para conservar tu tramo preferente.
          </div>
        ) : (
          <ol className="steps-list">
            {guidance.nextSteps.map((s, i) => (
              <li key={i} className="step-item">
                <div className="step-head">
                  <span className="step-action">{s.action}</span>
                  <span className="badge badge-success step-impact">+{s.impact} pts</span>
                </div>
                <div className="step-why text-muted text-sm">{s.why}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── CTA: desembolso (si es bancarizable) ───────────────────────── */}
      {score.total >= 550 && creditLine.creditLimit > 0 && (
        <button className="btn btn-primary w-full" onClick={() => alert('Desembolso vía COOPAC — Próximamente')}>
          Solicitar S/ {money(creditLine.creditLimit)} a mi billetera
        </button>
      )}
    </div>
  );
}

// ── Sub-vista: onboarding de productor (KYC sin fricción vía PPA) ────────────
function OnboardPrompt({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [dni, setDni] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await api.agroOnboard(dni);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-in">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>⬅️ Volver</button>
        <h1 className="text-xl font-bold m-0">Activa tu perfil agrícola</h1>
      </header>
      <div className="card">
        <p className="mb-md">
          Verificamos tu identidad sin papeleos: con tu DNI consultamos el <strong>Padrón de Productores
          Agrarios (PPA)</strong> del MIDAGRI. Si estás registrado, tu identidad y tu tierra quedan
          verificadas al instante.
        </p>
        <label className="form-label" htmlFor="dni">DNI (8 dígitos)</label>
        <input
          id="dni" className="form-input mb-md" inputMode="numeric" maxLength={8}
          value={dni} onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
          placeholder="12345678"
        />
        {err && <p className="text-error text-sm mb-md">{err}</p>}
        <button className="btn btn-primary w-full" disabled={dni.length !== 8 || busy} onClick={submit}>
          {busy ? 'Verificando…' : 'Verificar en el PPA'}
        </button>
      </div>
    </div>
  );
}
