// ============================================================================
// Yunta-Agro — AgroCreditService: scoring crediticio agronómico.
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Espejo de CreditService (credit.service.ts) del MVP, adaptado al agro:
//
//   - El flujo de cobro agrícola es ESTACIONAL (1–2 cosechas/año), así que un
//     score puramente transaccional penalizaría injustamente al agricultor.
//     Se sustituye el peso de "frecuencia transaccional" por la TRAZABILIDAD
//     DE CAMPAÑA (campañas cumplidas + disciplina de insumos) y el KYC del PPA.
//
//   - Mantiene la misma forma: base 300, suma por factores, tope 1000, y ajuste
//     dinámico de límite + TEA según score (mejor score -> más límite, menos tasa).
//
// NOTA (Fase 1): depende de los modelos en schema.agro.prisma (ProducerProfile,
// AgroCampaign, CampaignInput) que aún no están migrados al schema activo. Se
// entrega como servicio real listo para conectar cuando se fusione el esquema.
// ============================================================================

import prisma from '../db';
import { MidagriService } from './midagri.service';

export interface AgroScoreBreakdown {
  total: number;
  base: number;
  ppaIdentity: number;
  ppaCapacity: number;
  campaignHistory: number;
  inputDiscipline: number;
  settlementFlow: number;
  bioInputBonus: number; // Solución 3: bonus por biofertilizantes / restauración del microbioma
}

export interface CreditCostBreakdown {
  tea: number;             // Tasa Efectiva Anual (%)
  tcea: number;            // Tasa de Costo Efectivo Anual (%) — incluye comisiones/portes/seguro
  components: {
    interestTea: number;   // costo financiero puro (= tea)
    adminCommission: number; // comisión administrativa anualizada (%)
    disbursementFee: number; // portes/desembolso anualizado (%)
    parametricInsurance: number; // prima del seguro paramétrico anualizada (%)
  };
}

export class AgroCreditService {
  /**
   * Recalcula el score agronómico (0–1000) de un productor y actualiza su línea
   * de crédito. Núcleo del motor de inclusión: convierte la producción y la
   * identidad agraria en capacidad crediticia.
   */
  static async calculateAgroScore(producerId: number): Promise<AgroScoreBreakdown> {
    const producer = await (prisma as any).producerProfile.findUnique({
      where: { id: producerId },
      include: {
        campaigns: { include: { inputs: true } },
      },
    });
    if (!producer) throw new Error('Producer not found');

    const breakdown: AgroScoreBreakdown = {
      total: 0,
      base: 300,            // base por registro (igual que el MVP)
      ppaIdentity: 0,
      ppaCapacity: 0,
      campaignHistory: 0,
      inputDiscipline: 0,
      settlementFlow: 0,
      bioInputBonus: 0,
    };

    // ── 1. KYC sin fricción vía PPA/MIDAGRI ─────────────────────────────────
    // Estar en el padrón = identidad + tenencia verificada. Se cachea el
    // resultado en el ProducerProfile para no consultar la API en cada cálculo.
    let ppaVerified = producer.ppaVerified as boolean;
    let hectares = producer.hectares as number;

    if (!ppaVerified && producer.dni) {
      const ppa = await MidagriService.lookupPadron(producer.dni);
      ppaVerified = ppa.exists;
      hectares = ppa.hectares ?? 0;
      await (prisma as any).producerProfile.update({
        where: { id: producerId },
        data: {
          ppaVerified,
          ppaCode: ppa.ppaCode,
          hectares,
          region: ppa.region,
          mainCrop: ppa.mainCrop,
        },
      });
    }

    if (ppaVerified) {
      breakdown.ppaIdentity = 200;                          // identidad agraria verificada
      breakdown.ppaCapacity = Math.min(150, Math.round(hectares * 10)); // proxy de capacidad
    }

    // ── 2. Trazabilidad de campaña (reemplaza "frecuencia transaccional") ───
    const campaigns = producer.campaigns as Array<{
      harvestWeightKg: number;
      status: string;
      inputs: Array<{ type: string; paidWith: string; description: string }>;
    }>;

    const completedCampaigns = campaigns.filter(c => c.harvestWeightKg > 0);
    breakdown.campaignHistory = Math.min(320, completedCampaigns.length * 80);

    // Disciplina de insumos: compró semilla/fertilizante (no solo jornales).
    breakdown.inputDiscipline = this.scoreInputDiscipline(campaigns);

    // ── 2b. Solución 3: bonus por biofertilizantes / microbioma ─────────────
    // Si el Cashbook registra insumos biológicos (Trichoderma, micorrizas, etc.)
    // en lugar de químicos, el motor premia algorítmicamente esa práctica
    // regenerativa: mejor suelo = menor riesgo de default a largo plazo.
    breakdown.bioInputBonus = this.scoreBioInputs(campaigns);

    // ── 3. Flujo de liquidación interoperable (heredado de Yunta) ───────────
    // Pagos de agroexportadoras/acopiadores vía TAPP/CCE al teléfono del productor.
    breakdown.settlementFlow = await this.scoreSettlementFlow(producer.merchantId);

    // ── Total con tope 1000 ─────────────────────────────────────────────────
    breakdown.total = Math.min(
      1000,
      breakdown.base +
        breakdown.ppaIdentity +
        breakdown.ppaCapacity +
        breakdown.campaignHistory +
        breakdown.inputDiscipline +
        breakdown.settlementFlow +
        breakdown.bioInputBonus
    );

    await this.applyToCreditLine(producer.merchantId, breakdown.total);
    return breakdown;
  }

  /**
   * Calcula la TCEA (Tasa de Costo Efectivo Anual) a partir de la TEA y los
   * costos no financieros del crédito agro. La TCEA es la cifra que la SBS exige
   * mostrar al cliente: refleja el costo TOTAL del crédito, no solo el interés.
   *
   * Se compone de forma multiplicativa (no suma simple), como exige la metodología
   * de costo efectivo: (1+TEA)·(1+comisiones)·... − 1. Esto refleja que las
   * comisiones también "ganan" tiempo durante el año.
   *
   * Para Yunta-Agro los costos no financieros bajan con el score (mejor productor
   * = menos riesgo = menos comisión administrativa y prima de seguro).
   */
  static computeCreditCost(tea: number, score: number, bioInputBonus = 0): CreditCostBreakdown {
    // Comisión administrativa: 3.5% (score 300) → 1.0% (score 1000).
    const adminCommission = Math.max(1.0, 3.5 - ((score - 300) / 700) * 2.5);
    // Portes/desembolso anualizado: fijo y bajo (canal digital + COOPAC).
    const disbursementFee = 0.8;
    // Prima del seguro paramétrico anualizada: 2.5% (score 300) → 1.2% (score 1000).
    // El buen productor diversifica mejor el riesgo climático probado en campañas.
    const baseInsurance = Math.max(1.2, 2.5 - ((score - 300) / 700) * 1.3);
    // Solución 3: "descuento verde". El manejo regenerativo (biofertilizantes,
    // microbioma) reduce el riesgo agronómico → hasta 0.5% menos de prima de
    // seguro. bioInputBonus va de 0 a 120 → descuento de 0 a 0.5 puntos.
    const greenDiscount = Math.min(0.5, (bioInputBonus / 120) * 0.5);
    const parametricInsurance = Math.max(0.9, baseInsurance - greenDiscount);

    // Composición multiplicativa (metodología de costo efectivo).
    const factor =
      (1 + tea / 100) *
      (1 + adminCommission / 100) *
      (1 + disbursementFee / 100) *
      (1 + parametricInsurance / 100);
    const tcea = (factor - 1) * 100;

    return {
      tea: round2(tea),
      tcea: round2(tcea),
      components: {
        interestTea: round2(tea),
        adminCommission: round2(adminCommission),
        disbursementFee: round2(disbursementFee),
        parametricInsurance: round2(parametricInsurance),
      },
    };
  }

  /** Premia haber comprado insumos productivos a tiempo (no solo mano de obra). */
  private static scoreInputDiscipline(
    campaigns: Array<{ inputs: Array<{ type: string }> }>
  ): number {
    let pts = 0;
    for (const c of campaigns) {
      const hasSeed = c.inputs.some(i => i.type === 'Seed');
      const hasFertilizer = c.inputs.some(i => i.type === 'Fertilizer');
      if (hasSeed) pts += 15;
      if (hasFertilizer) pts += 15;
    }
    return Math.min(130, pts);
  }

  // Léxico de insumos biológicos/regenerativos reconocidos en el Cashbook.
  private static readonly BIO_INPUTS = [
    'trichoderma', 'micorriza', 'micorrizas', 'rhizobium', 'rizobium',
    'biol', 'compost', 'humus', 'biofertilizante', 'bocashi',
    'azotobacter', 'bacillus', 'guano de isla', 'lombricompost',
  ];

  /**
   * Solución 3: bonus algorítmico por uso de biofertilizantes / restauración del
   * microbioma. Detecta insumos biológicos por `type` ('BioFertilizer') o por
   * coincidencia en la descripción (Trichoderma, micorrizas, biol, compost…).
   * Premia +20 por campaña con bioinsumos, tope 120. Es una señal de manejo
   * regenerativo: mejor salud del suelo → menor riesgo crediticio estructural.
   */
  private static scoreBioInputs(
    campaigns: Array<{ inputs: Array<{ type: string; description: string }> }>
  ): number {
    let pts = 0;
    for (const c of campaigns) {
      const usesBio = c.inputs.some(i => this.isBioInput(i));
      if (usesBio) pts += 20;
    }
    return Math.min(120, pts);
  }

  /** ¿Este insumo es biológico/regenerativo? (por tipo explícito o por descripción). */
  static isBioInput(input: { type: string; description: string }): boolean {
    if (input.type === 'BioFertilizer') return true;
    const desc = (input.description ?? '').toLowerCase();
    return this.BIO_INPUTS.some(term => desc.includes(term));
  }

  /** Reutiliza el ledger del MVP: volumen recibido vía pagos interoperables. */
  private static async scoreSettlementFlow(merchantId: number): Promise<number> {
    const merchant = await prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: { phoneNumber: true },
    });
    if (!merchant) return 0;

    const received = await prisma.transaction.findMany({
      where: { receiverPhone: merchant.phoneNumber, status: 'Settled' },
      select: { amount: true },
    });
    const volume = received.reduce((acc, t) => acc + t.amount, 0);

    let pts = 0;
    if (volume > 2000) pts += 50;
    if (volume > 10000) pts += 50;
    return pts; // tope 100
  }

  /**
   * Aplica el score a la línea de crédito: límite y TEA dinámicos.
   * Misma curva que el MVP (TEA de 45% a 15% según score), pero el límite se
   * ancla a hectáreas + historial de campaña en vez de a volumen transaccional.
   */
  private static async applyToCreditLine(merchantId: number, score: number) {
    const creditLine = await prisma.creditLine.findUnique({ where: { merchantId } });
    if (!creditLine) return;

    // TEA dinámica: 45% (score 300) -> 15% (score 1000). Idéntica al MVP.
    // Se redondea a 2 decimales para no arrastrar ruido de Float a la UI.
    const interestRateEffective = round2(Math.max(15, 45 - ((score - 300) / 700) * 30));

    // Límite: solo se eleva si el score supera 500 (umbral de confianza).
    let creditLimit = creditLine.creditLimit;
    if (score > 500) {
      // Capital de trabajo proporcional a la capacidad productiva probada.
      creditLimit = Math.max(creditLine.creditLimit, score * 2);
    }

    await prisma.creditLine.update({
      where: { id: creditLine.id },
      data: { alternativeScore: score, creditLimit, interestRateEffective },
    });
  }
}

/** Redondeo monetario/porcentual a 2 decimales, estable para la UI financiera. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
