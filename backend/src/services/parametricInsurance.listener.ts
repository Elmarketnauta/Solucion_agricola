// ============================================================================
// Yunta-Agro — Listener del Seguro Paramétrico (PoC / Fase 3)
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Cierra el ciclo on-chain ↔ off-chain: escucha el evento PayoutTriggered del
// contrato ParametricInsurance.sol (en la Layer-2 EVM de Lnet/Besu) y dispara
// la indemnización en SOLES por el riel fiat (TAPP/CCE), REUTILIZANDO la lógica
// de liquidación interoperable que ya existe en el MVP.
//
// El agricultor cobra en soles; la blockchain solo decidió *si* y *cuánto*.
//
// DEPENDENCIAS (Fase 3, aún no instaladas en el MVP):
//   npm i ethers
// Este archivo es DISEÑO/PoC: documenta el contrato de integración, no se
// arranca en el runtime actual (no hay nodo L2 ni ethers en package.json).
// ============================================================================

import { ethers } from 'ethers';
import prisma from '../db';
import { LedgerService } from './ledger.service';

// ── Configuración de red (vendría de variables de entorno en producción) ────
const L2_RPC_URL = process.env.LNET_L2_RPC_URL ?? 'https://rpc.l2.lnet.global';
const INSURANCE_CONTRACT = process.env.PARAMETRIC_INSURANCE_ADDRESS ?? '0x0';

// ABI mínimo: solo el evento que nos interesa escuchar + confirmación.
const ABI = [
  'event PayoutTriggered(bytes32 indexed policyId, bytes32 indexed producerId, uint256 amount, uint8 eventType)',
  'function confirmPaidOut(bytes32 policyId) external',
];

const EVENT_LABEL = ['None', 'Drought', 'Yaku', 'Flood'] as const;

export class ParametricInsuranceListener {
  private static provider: ethers.JsonRpcProvider;
  private static contract: ethers.Contract;

  /**
   * Arranca el listener. Se llamaría una vez en el bootstrap del servidor
   * (junto al resto de servicios) en la Fase 3.
   */
  static start(signer?: ethers.Signer) {
    this.provider = new ethers.JsonRpcProvider(L2_RPC_URL);
    this.contract = new ethers.Contract(
      INSURANCE_CONTRACT,
      ABI,
      signer ?? this.provider
    );

    // El árbitro on-chain decidió un siniestro -> liquidamos fiat off-chain.
    this.contract.on('PayoutTriggered', (policyId, producerId, amount, eventType) =>
      this.handlePayout(policyId, producerId, amount, Number(eventType)).catch(console.error)
    );

    console.log('[ParametricInsurance] Listener activo en', INSURANCE_CONTRACT);
  }

  /**
   * Maneja un PayoutTriggered: convierte la decisión on-chain en un pago en
   * soles al agricultor por TAPP/CCE, con idempotencia para no pagar dos veces
   * si el evento se reemite (re-org, reconexión del listener).
   */
  static async handlePayout(
    policyId: string,
    _producerId: string,
    amountCentimos: bigint,
    eventType: number
  ) {
    const eventLabel = EVENT_LABEL[eventType] ?? 'Drought';
    // El contrato trabaja en céntimos (entero); el ledger del MVP en PEN (Float).
    const amountPen = Number(amountCentimos) / 100;

    const policy = await prisma.insurancePolicy.findUnique({
      where: { chainPolicyId: policyId },
      include: { producer: true },
    });
    if (!policy) {
      console.warn(`[ParametricInsurance] Póliza ${policyId} no encontrada off-chain`);
      return;
    }
    if (policy.status === 'PaidOut') {
      // Idempotencia: ya se pagó. No repetir.
      return;
    }

    // Teléfono del agricultor para la liquidación interoperable.
    const producerMerchant = await prisma.merchantProfile.findUnique({
      where: { id: policy.producer.merchantId },
      select: { phoneNumber: true },
    });
    if (!producerMerchant) {
      console.warn(`[ParametricInsurance] Productor sin teléfono para ${policyId}`);
      return;
    }

    // ── REUTILIZACIÓN DEL MVP ───────────────────────────────────────────────
    // El payout es, para el ledger, un "pago interoperable entrante" igual que
    // un Yape/Plin: misma ruta atómica, misma idempotencia (chainPolicyId como
    // firma única). El agricultor ve el abono en soles, sin saber que hubo un
    // contrato inteligente detrás.
    const tx = await LedgerService.processIncomingInteroperablePayment(
      producerMerchant.phoneNumber,
      amountPen,
      `ParametricInsurance_${eventLabel}`, // interoperableSource
      `INSURANCE_${policyId}`               // txSignature única -> anti-doble-pago
    );

    // Cierra el ciclo off-chain y, opcionalmente, confirma on-chain.
    await prisma.insurancePolicy.update({
      where: { id: policy.id },
      data: {
        status: 'PaidOut',
        triggeredEventType: eventLabel,
        payoutTxId: tx.id,
      },
    });

    console.log(
      `[ParametricInsurance] ${eventLabel}: S/ ${amountPen.toFixed(2)} liquidados a ` +
      `${producerMerchant.phoneNumber} (póliza ${policyId}, tx ${tx.id})`
    );

    // Confirmación on-chain para la auditoría (requiere signer con rol insurer).
    if ('confirmPaidOut' in this.contract && (this.contract as any).runner?.sendTransaction) {
      try {
        await (this.contract as any).confirmPaidOut(policyId);
      } catch (e) {
        console.warn('[ParametricInsurance] confirmPaidOut on-chain falló (no bloqueante)', e);
      }
    }
  }
}
