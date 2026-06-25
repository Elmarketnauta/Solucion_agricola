// ============================================================================
// Yunta-Agro — Centro Agronómico (Capa Precursora AgTech).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Panel técnico-operativo para el productor / agrónomo. Rotula cada indicador
// con su variable agronómica, unidad y umbral, integrando las 5 soluciones
// AgTech: telemetría IoT, oráculo climático, seguro paramétrico, scoring verde
// y pasaporte de trazabilidad EUDR.
// ============================================================================
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { api, type AgroAlert, type EudrPassport, type TelemetrySeries, type OracleReading, type AgroCenterData } from '../lib/api';
import Sparkline from '../components/Sparkline';

// ── Tipos del perfil agro ───────────────────────────────────────────────────
interface Campaign {
  id: number; crop: string; season: string; status: string;
  harvestWeightKg: number; buyerName: string | null; inputCount: number;
}
interface AgroProfile {
  producerId: number; dni: string; ppaVerified: boolean; hectares: number;
  region: string | null; mainCrop: string | null; campaigns: Campaign[];
}

// ── Umbrales agronómicos (espejo de telemetry.service.ts del backend) ───────
// Se rotulan en la UI para que el usuario entienda QUÉ dispara cada alerta.
const THRESHOLDS = {
  soilMoistureCritical: 12, // % VWC — estrés hídrico severo
  soilMoistureWarn: 18,     // % VWC — alerta temprana de riego
  airTempHeat: 32,          // °C — estrés térmico (ola de calor / El Niño)
  airTempFrost: 2,          // °C — riesgo de helada
};

// Mapa de severidad → color/etiqueta clínica.
const SEVERITY: Record<string, { label: string; cls: string }> = {
  Critical: { label: 'CRÍTICO', cls: 'agro-sev-critical' },
  Warning:  { label: 'ALERTA',  cls: 'agro-sev-warning' },
  Info:     { label: 'AVISO',   cls: 'agro-sev-info' },
};

// Diccionario técnico de tipos de alerta (rótulo + variable monitoreada).
const ALERT_META: Record<string, { label: string; variable: string; icon: string }> = {
  WaterStress:      { label: 'Estrés hídrico',      variable: 'Humedad volumétrica del suelo (VWC)', icon: '💧' },
  HeatStress:       { label: 'Estrés térmico',      variable: 'Temperatura del aire (T_air)',         icon: '🌡️' },
  FrostRisk:        { label: 'Riesgo de helada',    variable: 'Temperatura mínima (T_min)',           icon: '❄️' },
  DeviceOffline:    { label: 'Salud del nodo IoT',  variable: 'Nivel de batería del sensor',          icon: '🔋' },
  InsurancePayout:  { label: 'Indemnización',       variable: 'Disparo paramétrico',                  icon: '🛡️' },
};

function fmt(n: number, d = 1) {
  return n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function AgroCenter() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AgroProfile | null>(null);
  const [alerts, setAlerts] = useState<AgroAlert[]>([]);
  const [series, setSeries] = useState<TelemetrySeries | null>(null);
  const [oracle, setOracle] = useState<OracleReading | null>(null);
  const [center, setCenter] = useState<AgroCenterData | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, c] = await Promise.all([
        api.agroProfile(),
        api.agroCenter().catch(() => null),
      ]);
      setProfile(p);
      setCenter(c);
      const campaign: Campaign | null = p.campaigns?.[0] ?? null;
      setActiveCampaign(campaign);
      if (campaign) {
        const [a, s] = await Promise.all([
          api.agroAlerts(campaign.id).catch(() => ({ alerts: [] as AgroAlert[] })),
          api.agroSeries(campaign.id).catch(() => ({ series: null, oracle: null })),
        ]);
        setAlerts(a.alerts ?? []);
        setSeries((s as any).series ?? null);
        setOracle((s as any).oracle ?? null);
      }
    } catch (e: any) {
      if (/no encontrado/i.test(e.message)) setError('Activa tu perfil agrícola en Score Agro para usar el Centro Agronómico.');
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

  if (error || !profile) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🌱</div>
        <p className="text-muted">{error ?? 'No se pudo cargar el Centro Agronómico'}</p>
        <button className="btn btn-primary mt-lg" onClick={() => navigate('/agro')}>Ir a Score Agro</button>
      </div>
    );
  }

  // Índice de salud de la campaña: 100 menos penalización por alertas activas.
  const healthIndex = computeHealthIndex(alerts);

  return (
    <div className="animate-in">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>⬅️ Volver</button>
        <h1 className="text-xl font-bold m-0">Centro Agronómico</h1>
      </header>

      {/* ── Hero: estado agroclimático + georreferencia del lote ─────────── */}
      <div className="card mb-lg agro-hero">
        <div className="flex items-center justify-between mb-sm">
          <div>
            <div className="text-muted text-sm">Lote monitoreado · {profile.region ?? 'Región no declarada'}</div>
            <h2 className="text-lg font-semibold m-0">{profile.mainCrop ?? 'Cultivo'} · {profile.hectares} ha</h2>
          </div>
          <span className={`badge ${profile.ppaVerified ? 'badge-success' : 'badge-warning'}`}>
            {profile.ppaVerified ? 'PPA verificado' : 'PPA pendiente'}
          </span>
        </div>

        <div className="agro-health-row">
          <Gauge value={healthIndex} />
          <div className="agro-health-meta">
            <div className="agro-health-label">Índice de Salud del Cultivo (CHI)</div>
            <div className="text-muted text-sm">
              Compuesto de telemetría IoT activa. 100 = sin estrés detectado.
              Penaliza alertas hídricas, térmicas y de helada.
            </div>
          </div>
        </div>
      </div>

      {/* ── Bloque 1: Telemetría IoT en vivo (serie temporal real) ─────────── */}
      <SectionTitle icon="📡" title="Telemetría IoT" subtitle={`Red de sensores M2M · ${series?.count ?? 0} lecturas`} />
      <div className="card mb-lg">
        <div className="agro-metric-grid">
          <MetricBand
            label="Humedad de suelo"
            tag="VWC"
            unit="% vol"
            value={latestOf(series, 'soilMoisturePct', alerts, 'WaterStress', 26)}
            sparkData={seriesValues(series, 'soilMoisturePct')}
            sparkThreshold={THRESHOLDS.soilMoistureCritical}
            sparkDomain={[0, 40]}
            stat={series?.stats.soilMoisture}
            bands={[
              { upTo: THRESHOLDS.soilMoistureCritical, cls: 'band-critical', label: 'Estrés severo' },
              { upTo: THRESHOLDS.soilMoistureWarn, cls: 'band-warn', label: 'Riego pronto' },
              { upTo: 100, cls: 'band-ok', label: 'Óptimo' },
            ]}
            domain={[0, 40]}
            hint="Contenido volumétrico de agua en el suelo. Por debajo de 12% el cultivo entra en estrés hídrico severo."
          />
          <MetricBand
            label="Temperatura del aire"
            tag="T_air"
            unit="°C"
            value={latestOf(series, 'airTempC', alerts, 'HeatStress', 21)}
            sparkData={seriesValues(series, 'airTempC')}
            sparkThreshold={THRESHOLDS.airTempHeat}
            sparkDomain={[-2, 40]}
            stat={series?.stats.airTemp}
            bands={[
              { upTo: THRESHOLDS.airTempFrost, cls: 'band-critical', label: 'Helada' },
              { upTo: THRESHOLDS.airTempHeat, cls: 'band-ok', label: 'Normal' },
              { upTo: 50, cls: 'band-warn', label: 'Estrés térmico' },
            ]}
            domain={[-2, 40]}
            hint="Por encima de 32°C hay estrés térmico (asociado a El Niño); por debajo de 2°C, riesgo de helada."
          />
        </div>

        {/* Tarjetas de variables secundarias del nodo (última lectura real). */}
        <div className="agro-stat-strip mt-md">
          <MiniStat label="Humedad relativa" tag="RH" value={pctOrDash(series?.latest?.humidityPct)} />
          <MiniStat label="Temp. de suelo" tag="T_soil" value={degOrDash(series?.latest?.soilTempC)} />
          <MiniStat label="Batería del nodo" tag="SoC" value={pctOrDash(series?.latest?.batteryPct)} />
          <MiniStat label="Última lectura" tag="ts" value={agoLabel(series?.latest?.t)} />
        </div>
      </div>

      {/* ── Bloque 2: Alertas agronómicas activas ─────────────────────────── */}
      <SectionTitle icon="🚨" title="Alertas activas" subtitle="Eventos derivados del cruce telemetría × umbrales" />
      <div className="card mb-lg">
        {alerts.length === 0 ? (
          <div className="agro-ok-banner">
            ✅ Sin alertas activas. Todas las variables monitoreadas están dentro de rango agronómico.
          </div>
        ) : (
          <div className="agro-alert-list">
            {alerts.map(a => {
              const meta = ALERT_META[a.type] ?? { label: a.type, variable: '—', icon: '⚠️' };
              const sev = SEVERITY[a.severity] ?? SEVERITY.Info;
              return (
                <div key={a.id} className="agro-alert-item">
                  <div className="agro-alert-icon">{meta.icon}</div>
                  <div className="agro-alert-body">
                    <div className="agro-alert-head">
                      <span className="agro-alert-title">{meta.label}</span>
                      <span className={`agro-sev-badge ${sev.cls}`}>{sev.label}</span>
                    </div>
                    <div className="agro-alert-msg">{a.message}</div>
                    <div className="agro-alert-meta">
                      Variable: {meta.variable}
                      {a.metricValue != null && a.threshold != null && (
                        <> · Lectura <b>{a.metricValue}</b> vs. umbral <b>{a.threshold}</b></>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bloque 3: Oráculo climático centralizado ──────────────────────── */}
      <SectionTitle icon="🛰️" title="Oráculo climático" subtitle="Fuente de verdad off-chain · SENAMHI (simulado)" />
      <div className="card mb-lg">
        <div className="agro-oracle-grid">
          <MiniStat label="Precipitación 24h" tag="PP" value={oracle ? `${fmt(oracle.precipitationMm)} mm` : '—'} />
          <MiniStat label="Temp. máxima" tag="T_max" value={oracle ? `${fmt(oracle.tempMaxC)} °C` : '—'} />
          <MiniStat label="Temp. mínima" tag="T_min" value={oracle ? `${fmt(oracle.tempMinC)} °C` : '—'} />
          <MiniStat label="Estación" tag="geo" value={oracle?.stationKey ?? '—'} />
        </div>
        <div className="agro-hash-row mt-md">
          <span className="agro-hash-label">Sello de integridad (SHA-256)</span>
          <code className="agro-hash">{oracle ? `${oracle.payloadHash.slice(0, 8)}…${oracle.payloadHash.slice(-4)} ✓` : '—'}</code>
        </div>
        <p className="text-muted text-sm mt-sm m-0">
          Cada lectura diaria se sella con un hash; alterar el dato rompe el sello.
          Es la fuente inmutable ({oracle?.source ?? 'oráculo'}) que evalúa el seguro paramétrico.
        </p>
      </div>

      {/* ── Bloque 4: Seguro paramétrico ──────────────────────────────────── */}
      <SectionTitle icon="🛡️" title="Seguro paramétrico" subtitle="Disparo automático sin peritaje · liquidación en soles" />
      <div className="card mb-lg">
        <div className="agro-trigger-grid">
          <TriggerRow label="Sequía" param="PP acumulada < umbral" status="Vigilando" cls="status-ok" />
          <TriggerRow label="Ola de calor (El Niño)" param="T_max ≥ 33°C" status="Vigilando" cls="status-ok" />
          <TriggerRow label="Helada" param="T_min ≤ 1°C" status="Vigilando" cls="status-ok" />
        </div>
        <p className="text-muted text-sm mt-sm m-0">
          El motor evalúa estos parámetros a diario contra el oráculo. Si se rompe
          el umbral, la indemnización se abona automáticamente a tu billetera.
        </p>
      </div>

      {/* ── Bloque 5: Pasaporte de trazabilidad EUDR ──────────────────────── */}
      <SectionTitle icon="📜" title="Trazabilidad y certificación EUDR" subtitle="Pasaporte digital del lote · deforestación cero" />
      <EudrPanel campaign={activeCampaign} profile={profile} />

      {/* ── Bloque 6: Identidad soberana PPA (Solución 7) ─────────────────── */}
      <SectionTitle icon="🪪" title="Identidad agraria soberana (PPA)" subtitle="Padrón de Productores Agrarios · ancla KYC" />
      <IdentityPanel center={center} />

      {/* ── Bloque 7: Parcelas georreferenciadas (Solución 7) ─────────────── */}
      <SectionTitle icon="🗺️" title="Parcelas georreferenciadas" subtitle="Catastro del padrón · tenencia y superficie" />
      <ParcelsPanel center={center} />

      {/* ── Bloque 8: Riesgo por agricultura de precisión (Solución 9) ─────── */}
      <SectionTitle icon="🛩️" title="Agricultura de precisión (drones)" subtitle="Visión computacional · NDVI / sanidad / estrés" />
      <DronePanel center={center} />

      {/* ── Bloque 9: Subsidios gubernamentales TAPP (Solución 6) ──────────── */}
      <SectionTitle icon="🏛️" title="Subsidios TAPP (BCRP)" subtitle="Fertiabono · riel interoperable · liquidado en soles" />
      <SubsidyPanel center={center} />

      {/* ── Bloque 10: Billetera offline USSD/Mesh (Solución 8) ────────────── */}
      <SectionTitle icon="📵" title="Sincronización offline (USSD/Mesh)" subtitle="Transacciones firmadas sin internet · anti doble-gasto" />
      <OfflinePanel center={center} />
    </div>
  );
}

// ── Panel: identidad soberana PPA (Solución 7) ──────────────────────────────
function IdentityPanel({ center }: { center: AgroCenterData | null }) {
  const id = center?.identity;
  if (!id) return <div className="card mb-lg"><p className="text-muted text-sm m-0">Identidad no disponible.</p></div>;
  return (
    <div className="card mb-lg">
      <div className={`agro-integrity ${id.ppaVerified ? 'integrity-ok' : 'integrity-bad'} mb-md`}>
        {id.ppaVerified ? '🪪 Identidad PPA VERIFICADA — microcrédito habilitado' : '⛔ Sin identidad PPA — crédito bloqueado'}
      </div>
      <div className="agro-passport-grid">
        <MiniStat label="ID AgroDigital" tag="DID*" value={id.agroDigitalId ?? '—'} />
        <MiniStat label="Código PPA" tag="ppa" value={id.ppaCode ?? '—'} />
        <MiniStat label="Parcelas legales" tag="n" value={String(id.legalParcelCount)} />
        <MiniStat label="Superficie verificada" tag="ha" value={`${fmt(id.verifiedHectares)} ha`} />
      </div>
      {id.identityHash && (
        <div className="agro-hash-row mt-md">
          <span className="agro-hash-label">Hash de identidad (precursor SSI/VC)</span>
          <code className="agro-hash">{id.identityHash.slice(0, 12)}…{id.identityHash.slice(-4)}</code>
        </div>
      )}
      <p className="text-muted text-sm mt-sm m-0">
        El <code>agroDigitalId</code> y el hash de identidad son la base de una
        Credencial Verificable (VC/SSI) que se anclará a LNET en la Fase 3.
      </p>
    </div>
  );
}

// ── Panel: parcelas georreferenciadas (Solución 7) ──────────────────────────
function ParcelsPanel({ center }: { center: AgroCenterData | null }) {
  const parcels = center?.parcels ?? [];
  if (parcels.length === 0) {
    return <div className="card mb-lg"><p className="text-muted text-sm m-0">Sin parcelas ingestadas. Ejecuta la ingesta PPA para georreferenciar.</p></div>;
  }
  // Bounding box simple para encuadrar los marcadores en un mini-mapa esquemático.
  const lats = parcels.map(p => p.gpsLat), lngs = parcels.map(p => p.gpsLng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pos = (lat: number, lng: number) => ({
    top: `${90 - ((lat - minLat) / ((maxLat - minLat) || 1)) * 80}%`,
    left: `${10 + ((lng - minLng) / ((maxLng - minLng) || 1)) * 80}%`,
  });
  return (
    <div className="card mb-lg">
      <div className="agro-map" role="img" aria-label="Mapa esquemático de parcelas">
        {parcels.map((p, i) => (
          <div key={p.parcelCode} className="agro-map-pin" style={pos(p.gpsLat, p.gpsLng)} title={p.parcelCode}>📍<span>{i + 1}</span></div>
        ))}
        <span className="agro-map-note">GPS {fmt(minLat, 2)}…{fmt(maxLat, 2)}</span>
      </div>
      <div className="agro-parcel-list mt-md">
        {parcels.map((p, i) => (
          <div key={p.parcelCode} className="agro-parcel-row">
            <span className="agro-parcel-idx">{i + 1}</span>
            <div className="agro-parcel-body">
              <div className="agro-parcel-code">{p.parcelCode} <span className="agro-tag">{p.landTenure}</span></div>
              <div className="agro-parcel-meta">{fmt(p.hectares)} ha · {p.gpsLat.toFixed(4)}, {p.gpsLng.toFixed(4)}{p.district ? ` · ${p.district}` : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Panel: agricultura de precisión / drones (Solución 9) ───────────────────
function DronePanel({ center }: { center: AgroCenterData | null }) {
  const scans = center?.droneScans ?? [];
  const risks = (center?.riskAlerts ?? []).filter(r => r.source === 'Drone');
  return (
    <div className="card mb-lg">
      {scans.length === 0 ? (
        <p className="text-muted text-sm m-0">Sin vuelos de dron registrados para la campaña.</p>
      ) : (
        <>
          {scans.slice(0, 1).map(d => (
            <div key={d.flightId}>
              <div className="agro-oracle-grid">
                <MiniStat label="NDVI (vigor)" tag="idx" value={d.ndvi != null ? fmt(d.ndvi, 2) : '—'} />
                <MiniStat label="Temp. dosel" tag="T_canopy" value={d.canopyTempC != null ? `${fmt(d.canopyTempC)} °C` : '—'} />
                <MiniStat label="Madurez fruto" tag="%" value={d.fruitMaturityPct != null ? `${fmt(d.fruitMaturityPct, 0)} %` : '—'} />
                <MiniStat label="Área afectada" tag="%" value={d.affectedAreaPct != null ? `${fmt(d.affectedAreaPct, 0)} %` : '—'} />
              </div>
              <div className="text-muted text-sm mt-sm">Vuelo {d.flightId} · {d.provider} · {new Date(d.capturedAt).toLocaleDateString('es-PE')}</div>
            </div>
          ))}
        </>
      )}
      {risks.length > 0 && (
        <div className="agro-alert-list mt-md">
          {risks.map(r => {
            const sev = SEVERITY[r.severity] ?? SEVERITY.Info;
            return (
              <div key={r.id} className="agro-alert-item">
                <div className="agro-alert-icon">{r.category === 'Disease' ? '🦠' : '🌡️'}</div>
                <div className="agro-alert-body">
                  <div className="agro-alert-head">
                    <span className="agro-alert-title">{r.category === 'Disease' ? 'Enfermedad' : 'Estrés térmico'}</span>
                    <span className={`agro-sev-badge ${sev.cls}`}>{sev.label}</span>
                  </div>
                  <div className="agro-alert-msg">{r.message}</div>
                  <div className="agro-alert-meta">Impacto en score: <b>{r.riskDelta} pts</b> (temporal, hasta resolver)</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Panel: subsidios gubernamentales vía TAPP (Solución 6) ──────────────────
function SubsidyPanel({ center }: { center: AgroCenterData | null }) {
  const subs = center?.subsidies ?? [];
  const total = subs.reduce((a, s) => a + s.amount, 0);
  if (subs.length === 0) {
    return <div className="card mb-lg"><p className="text-muted text-sm m-0">Sin desembolsos de subsidios recibidos por TAPP.</p></div>;
  }
  return (
    <div className="card mb-lg">
      <div className="stat-box mb-md">
        <div className="stat-label">Total recibido vía TAPP</div>
        <div className="stat-value">S/ {fmt(total, 2)}</div>
      </div>
      <div className="agro-parcel-list">
        {subs.map(s => (
          <div key={s.bcrpReference} className="agro-parcel-row">
            <span className="agro-parcel-idx">🏛️</span>
            <div className="agro-parcel-body">
              <div className="agro-parcel-code">{s.programCode} · S/ {fmt(s.amount, 2)} <span className="agro-tag">{s.rail}</span></div>
              <div className="agro-parcel-meta">Ref. BCRP {s.bcrpReference} · {new Date(s.disbursedAt).toLocaleDateString('es-PE')}</div>
            </div>
            <span className="agro-sev-badge agro-sev-info">{s.status === 'Settled' ? 'LIQUIDADO' : s.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Panel: sincronización offline USSD/Mesh (Solución 8) ────────────────────
function OfflinePanel({ center }: { center: AgroCenterData | null }) {
  const txs = center?.offlineTxs ?? [];
  if (txs.length === 0) {
    return <div className="card mb-lg"><p className="text-muted text-sm m-0">Sin transacciones offline sincronizadas.</p></div>;
  }
  const STATUS: Record<string, string> = {
    Settled: 'agro-sev-info', Pending: 'agro-sev-warning',
    Rejected_Expired: 'agro-sev-critical', Rejected_Signature: 'agro-sev-critical',
  };
  return (
    <div className="card mb-lg">
      <div className="agro-parcel-list">
        {txs.map(t => (
          <div key={t.idempotencyKey} className="agro-parcel-row">
            <span className="agro-parcel-idx">{t.receivedVia === 'USSD' ? '📟' : t.receivedVia === 'MeshBLE' ? '📡' : '🔄'}</span>
            <div className="agro-parcel-body">
              <div className="agro-parcel-code">nonce #{t.nonce} <span className="agro-tag">{t.receivedVia}</span></div>
              <div className="agro-parcel-meta">{t.idempotencyKey.slice(0, 18)}… · {new Date(t.receivedAt).toLocaleDateString('es-PE')}</div>
            </div>
            <span className={`agro-sev-badge ${STATUS[t.status] ?? 'agro-sev-info'}`}>{t.status.replace('Rejected_', '✕ ')}</span>
          </div>
        ))}
      </div>
      <p className="text-muted text-sm mt-sm m-0">
        Cada transacción se valida por <code>idempotencyKey</code> + <code>nonce</code>
        monótono + firma, evitando el doble gasto al recuperar señal.
      </p>
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function SectionTitle({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="agro-section-title">
      <span className="agro-section-icon">{icon}</span>
      <div>
        <div className="agro-section-name">{title}</div>
        <div className="agro-section-sub">{subtitle}</div>
      </div>
    </div>
  );
}

// Medidor radial del índice de salud (0–100).
function Gauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 75 ? 'var(--brote)' : pct >= 45 ? '#F4B23E' : 'var(--arcilla)';
  return (
    <div className="agro-gauge" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--bg-input) 0deg)` }}>
      <div className="agro-gauge-inner">
        <span className="agro-gauge-value">{Math.round(pct)}</span>
        <span className="agro-gauge-unit">CHI</span>
      </div>
    </div>
  );
}

// Barra con bandas de umbral (semáforo agronómico) + marcador de lectura +
// sparkline de tendencia con estadísticos (min/prom/max) de la serie real.
function MetricBand({ label, tag, unit, value, bands, domain, hint, sparkData, sparkThreshold, sparkDomain, stat }: {
  label: string; tag: string; unit: string; value: number;
  bands: { upTo: number; cls: string; label: string }[];
  domain: [number, number]; hint: string;
  sparkData?: (number | null)[]; sparkThreshold?: number; sparkDomain?: [number, number];
  stat?: { min: number | null; max: number | null; avg: number | null; last: number | null };
}) {
  const [min, max] = domain;
  const pos = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const hasSeries = (sparkData?.filter(v => v != null).length ?? 0) >= 2;
  return (
    <div className="agro-metric">
      <div className="agro-metric-head">
        <span className="agro-metric-label">{label} <code className="agro-tag">{tag}</code></span>
        <span className="agro-metric-value">{fmt(value)} <span className="agro-metric-unit">{unit}</span></span>
      </div>
      <div className="agro-band-track">
        {bands.map((b, i) => {
          const prev = i === 0 ? min : bands[i - 1].upTo;
          const width = ((Math.min(b.upTo, max) - prev) / (max - min)) * 100;
          return <div key={i} className={`agro-band ${b.cls}`} style={{ width: `${Math.max(0, width)}%` }} title={b.label} />;
        })}
        <div className="agro-band-marker" style={{ left: `${pos}%` }} />
      </div>
      {hasSeries && (
        <div className="agro-spark-row">
          <Sparkline data={sparkData!} threshold={sparkThreshold ?? null} domain={sparkDomain}
            width={150} height={34} ariaLabel={`Tendencia de ${label}`} />
          {stat && (
            <div className="agro-spark-stats">
              <span>mín <b>{stat.min ?? '—'}</b></span>
              <span>prom <b>{stat.avg ?? '—'}</b></span>
              <span>máx <b>{stat.max ?? '—'}</b></span>
            </div>
          )}
        </div>
      )}
      <div className="agro-metric-hint">{hint}</div>
    </div>
  );
}

function MiniStat({ label, tag, value }: { label: string; tag: string; value: string }) {
  return (
    <div className="agro-ministat">
      <div className="agro-ministat-top"><span className="agro-ministat-label">{label}</span><code className="agro-tag">{tag}</code></div>
      <div className="agro-ministat-value">{value}</div>
    </div>
  );
}

function TriggerRow({ label, param, status, cls }: { label: string; param: string; status: string; cls: string }) {
  return (
    <div className="agro-trigger-row">
      <div>
        <div className="agro-trigger-label">{label}</div>
        <code className="agro-trigger-param">{param}</code>
      </div>
      <span className={`agro-trigger-status ${cls}`}>{status}</span>
    </div>
  );
}

// Panel del pasaporte EUDR: emitir y/o verificar trazabilidad.
function EudrPanel({ campaign, profile }: { campaign: Campaign | null; profile: AgroProfile }) {
  const [passport, setPassport] = useState<EudrPassport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lookup, setLookup] = useState('');

  const canCertify = campaign && campaign.harvestWeightKg > 0 && profile.ppaVerified;

  async function issue() {
    if (!campaign) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.certificationIssue({ campaignId: campaign.id, buyerRuc: '20100000001', taxYear: new Date().getFullYear() });
      setMsg(r.alreadyIssued ? 'Pasaporte ya existente — recuperado.' : 'Pasaporte EUDR emitido ✓');
      const v = await api.certificationVerify(r.certUuid);
      setPassport(v.passport);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!lookup.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const v = await api.certificationVerify(lookup.trim());
      setPassport(v.passport);
    } catch (e: any) {
      setPassport(null);
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-lg">
      {!passport ? (
        <>
          <p className="text-sm mb-md">
            El pasaporte sella la cosecha con un <b>hash SHA-256</b> de su origen
            (GPS + PPA + campaña). Un comprador europeo puede verificar
            deforestación cero sin intermediarios.
          </p>
          {campaign && (
            <button className="btn btn-primary w-full mb-md" disabled={!canCertify || busy} onClick={issue}>
              {busy ? 'Emitiendo…' : canCertify ? 'Emitir pasaporte de la campaña' : 'Requiere cosecha registrada + PPA'}
            </button>
          )}
          <div className="agro-verify-box">
            <label className="form-label" htmlFor="cert">Verificar un pasaporte (auditor)</label>
            <div className="flex gap-sm">
              <input id="cert" className="form-input" placeholder="cert-uuid" value={lookup}
                onChange={e => setLookup(e.target.value)} />
              <button className="btn btn-secondary" disabled={busy} onClick={verify}>Verificar</button>
            </div>
          </div>
          {msg && <p className="text-muted text-sm mt-md m-0">{msg}</p>}
        </>
      ) : (
        <PassportView passport={passport} onReset={() => { setPassport(null); setMsg(null); }} />
      )}
    </div>
  );
}

function PassportView({ passport, onReset }: { passport: EudrPassport; onReset: () => void }) {
  const ok = passport.integrity === 'valid';
  return (
    <div>
      <div className={`agro-integrity ${ok ? 'integrity-ok' : 'integrity-bad'}`}>
        {ok ? '🔒 Integridad VERIFICADA — el lote no fue manipulado' : '⛔ INTEGRIDAD ROTA — datos alterados'}
      </div>
      <div className="agro-passport-grid mt-md">
        <MiniStat label="Producto" tag="crop" value={passport.product ?? '—'} />
        <MiniStat label="Volumen" tag="kg" value={`${passport.productKg} kg`} />
        <MiniStat label="Región" tag="geo" value={passport.region ?? '—'} />
        <MiniStat label="Código PPA" tag="ppa" value={passport.ppaCode ?? '—'} />
      </div>
      {passport.gps && (
        <div className="agro-hash-row mt-md">
          <span className="agro-hash-label">Geolocalización del lote</span>
          <code className="agro-hash">{passport.gps.lat.toFixed(4)}, {passport.gps.lng.toFixed(4)}</code>
        </div>
      )}
      <div className="agro-hash-row mt-sm">
        <span className="agro-hash-label">Hash de certificación</span>
        <code className="agro-hash">{passport.vcHash.slice(0, 16)}…</code>
      </div>
      <div className="agro-hash-row mt-sm">
        <span className="agro-hash-label">Anclaje on-chain (LNET)</span>
        <code className="agro-hash">{passport.anchoredOnChain ? passport.chainTxHash : 'Pendiente · Fase 3'}</code>
      </div>
      <button className="btn btn-secondary w-full mt-md" onClick={onReset}>← Volver</button>
    </div>
  );
}

// ── Lógica de derivación de indicadores ─────────────────────────────────────

// Índice de salud del cultivo (CHI): 100 menos penalización por alertas activas.
function computeHealthIndex(alerts: AgroAlert[]): number {
  let chi = 100;
  for (const a of alerts) {
    if (a.severity === 'Critical') chi -= 30;
    else if (a.severity === 'Warning') chi -= 15;
    else chi -= 5;
  }
  return Math.max(0, chi);
}

// Extrae los valores de una variable de la serie temporal (para el sparkline).
function seriesValues(series: TelemetrySeries | null, key: keyof TelemetryPointVals): (number | null)[] {
  return series?.points.map(p => (p as any)[key] ?? null) ?? [];
}

// Última lectura real de la serie; si no hay serie, cae a la lectura de la alerta
// correspondiente; y en último caso a un nominal (solo si nunca hubo telemetría).
function latestOf(
  series: TelemetrySeries | null, key: keyof TelemetryPointVals,
  alerts: AgroAlert[], alertType: string, nominal: number,
): number {
  const fromSeries = series?.latest ? (series.latest as any)[key] : null;
  if (typeof fromSeries === 'number') return fromSeries;
  const hit = alerts.find(a => a.type === alertType && a.metricValue != null);
  return hit?.metricValue ?? nominal;
}

type TelemetryPointVals = { soilMoisturePct: number | null; airTempC: number | null; soilTempC: number | null; humidityPct: number | null; batteryPct: number | null };

function pctOrDash(v: number | null | undefined): string {
  return typeof v === 'number' ? `${fmt(v, 0)} %` : '—';
}
function degOrDash(v: number | null | undefined): string {
  return typeof v === 'number' ? `${fmt(v)} °C` : '—';
}
// Etiqueta relativa "hace N min/h" de un timestamp ISO.
function agoLabel(iso: string | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
