// ============================================================================
// Yunta-Agro — Solución 4: Motor CENTRALIZADO de seguros paramétricos (off-chain).
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Capa Precursora del contrato inteligente de seguro paramétrico. Mientras no
// haya LNET, este servicio corre DIARIAMENTE (node-cron), lee la fuente de verdad
// del oráculo (OracleWeatherDataCache, Solución 2) y la compara con las pólizas
// activas. Si el parámetro climático se rompe (sequía / ola de calor por El Niño
// / helada), DETONA la indemnización automáticamente y liquida en soles usando
// el ledger atómico existente (LedgerService) — el mismo que evita el doble gasto.
//
// Separación clave (idéntica al futuro modelo on-chain):
//   - DECISIÓN: ¿se rompió el parámetro? (este servicio / luego el contrato)
//   - LIQUIDACIÓN: pago en soles (LedgerService, off-chain en ambos casos)
// La idempotencia del payout se ancla en txSignature `INSURANCE_<policyId>`, así
// un re-disparo (reinicio del cron, doble ejecución) NUNCA paga dos veces.
//
// NO importa ethers ni Solidity. Cuando LNET entregue accesos, la "decisión" se
// mueve al contrato y este servicio pasa a ser el listener; la liquidación fiat
// (este mismo código de pago) no cambia.
// ============================================================================
import prisma from '../db';
import { LedgerService } from './ledger.service';
import { WeatherOracleService } from './weatherOracle.service';

export interface EvaluationOutcome {
  evaluated: number;
  triggered: number;
  paidOut: { policyId: string; producerPhone: string; amount: number; eventType: string }[];
}

export class ParametricInsuranceService {
  /**
   * Evalúa TODAS las pólizas activas vigentes contra el oráculo para una fecha
   * (default hoy). Detona y liquida las que rompan su parámetro.
   */
  static async evaluateActivePolicies(forDate: Date = new Date()): Promise<EvaluationOutcome> {
    const now = forDate;
    const policies = await prisma.insurancePolicy.findMany({
      where: { status: 'Active', periodStart: { lte: now }, periodEnd: { gte: now } },
      include: { producer: { include: { merchant: true } } },
    });

    const outcome: EvaluationOutcome = { evaluated: 0, triggered: 0, paidOut: [] };

    for (const policy of policies) {
      outcome.evaluated += 1;
      const weather = await WeatherOracleService.getWeatherForDate(policy.stationKey, now);

      // Sin dato del oráculo: solo marca la revisión y continúa (no se castiga al productor).
      if (!weather) {
        await prisma.insurancePolicy.update({
          where: { id: policy.id }, data: { lastEvaluatedAt: now },
        });
        continue;
      }

      const trigger = this.checkTrigger(policy, weather);
      await prisma.insurancePolicy.update({
        where: { id: policy.id }, data: { lastEvaluatedAt: now },
      });

      if (trigger) {
        const phone = policy.producer.merchant.phoneNumber;
        await this.settlePayout(policy.id, policy.chainPolicyId, phone, policy.coverageAmount, trigger);
        outcome.triggered += 1;
        outcome.paidOut.push({
          policyId: policy.chainPolicyId, producerPhone: phone,
          amount: policy.coverageAmount, eventType: trigger,
        });
      }
    }

    return outcome;
  }

  /**
   * Regla paramétrica pura (testeable sin BD): decide el tipo de evento o null.
   * Prioridad: sequía > ola de calor (El Niño) > helada.
   */
  static checkTrigger(
    policy: { rainThresholdMm: number; tempMaxThreshold: number | null; tempMinThreshold: number | null },
    weather: { precipitationMm: number; tempMaxC: number; tempMinC: number },
  ): string | null {
    if (weather.precipitationMm < policy.rainThresholdMm) return 'Drought';
    if (policy.tempMaxThreshold != null && weather.tempMaxC >= policy.tempMaxThreshold) return 'HeatStress_ElNino';
    if (policy.tempMinThreshold != null && weather.tempMinC <= policy.tempMinThreshold) return 'Frost';
    return null;
  }

  /**
   * Liquida la indemnización en soles REUTILIZANDO el ledger atómico. La firma
   * `INSURANCE_<policyId>` es la garantía anti-doble-pago: si el payout ya se
   * registró, el @unique de txSignature lo bloquea y la póliza se cierra sin
   * volver a pagar.
   */
  private static async settlePayout(
    policyDbId: number, chainPolicyId: string, producerPhone: string,
    amount: number, eventType: string,
  ) {
    try {
      const tx = await LedgerService.processIncomingInteroperablePayment(
        producerPhone, amount,
        `ParametricInsurance_${eventType}`, // interoperableSource
        `INSURANCE_${chainPolicyId}`,        // txSignature única → anti doble-pago
      );

      await prisma.insurancePolicy.update({
        where: { id: policyDbId },
        data: { status: 'PaidOut', triggeredEventType: eventType, triggeredAt: new Date(), payoutTxId: tx.id },
      });

      // Alerta para el dashboard del productor (si la póliza referencia una campaña).
      // (Las pólizas no llevan campaignId directo; la alerta se omite si no aplica.)
      console.log(`[ParametricInsurance] ${eventType}: S/ ${amount.toFixed(2)} liquidados a ${producerPhone} (póliza ${chainPolicyId}, tx ${tx.id})`);
      return tx;
    } catch (err: any) {
      // Si el pago ya existía (re-disparo), cerramos la póliza sin duplicar.
      if (err?.code === 'P2002') {
        await prisma.insurancePolicy.update({
          where: { id: policyDbId },
          data: { status: 'PaidOut', triggeredEventType: eventType, triggeredAt: new Date() },
        });
        return null;
      }
      throw err;
    }
  }
}
