// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Yunta-Agro — Seguro Paramétrico Autoejecutable (PoC)
 * Developed by Marketnauta
 * ---------------------------------------------------------------------------
 * Diseño para una Layer-2 EVM-compatible (rollup sobre Lnet/Besu permisionado).
 *
 * El contrato es el ÁRBITRO IMPARCIAL: decide *si* y *cuánto* indemnizar a
 * partir de datos climáticos del SENAMHI entregados por un oráculo
 * descentralizado (Chainlink / oráculo del consorcio Lnet). NO mueve dinero
 * fiat — emite el evento `PayoutTriggered`, y el backend de Yunta lo escucha y
 * liquida en SOLES vía TAPP/CCE (reutilizando processIncomingInteroperablePayment).
 *
 * Por qué on-chain: inmutabilidad de la póliza + ejecución sin intervención
 * humana + auditabilidad pública. Esto elimina el peritaje, que es lo que hace
 * inviable el microseguro rural tradicional (evaluar el siniestro cuesta más
 * que la indemnización).
 */
contract ParametricInsurance {
    enum PolicyStatus { Active, Triggered, Expired, PaidOut }
    enum EventType { None, Drought, Yaku, Flood }

    struct Policy {
        bytes32 producerId;      // hash del id del productor (sin PII on-chain)
        int256  gpsLat;          // *1e6 (fixed point, sin floats en EVM)
        int256  gpsLng;
        uint256 rainThresholdMm; // umbral de sequía (mm acumulados)
        uint256 coverageAmount;  // indemnización en céntimos de PEN (entero)
        uint256 periodStart;     // unix ts
        uint256 periodEnd;
        PolicyStatus status;
    }

    address public immutable insurer;   // backend de Yunta (suscribe pólizas)
    address public oracle;              // oráculo autorizado (SENAMHI feed)

    mapping(bytes32 => Policy) public policies;

    event PolicyCreated(bytes32 indexed policyId, bytes32 indexed producerId, uint256 coverageAmount);
    // El backend escucha ESTE evento para disparar la liquidación fiat.
    event PayoutTriggered(bytes32 indexed policyId, bytes32 indexed producerId, uint256 amount, EventType eventType);
    event PolicyExpired(bytes32 indexed policyId);

    error NotInsurer();
    error NotOracle();
    error PolicyNotActive();
    error OutsidePeriod();

    modifier onlyInsurer() { if (msg.sender != insurer) revert NotInsurer(); _; }
    modifier onlyOracle()  { if (msg.sender != oracle)  revert NotOracle();  _; }

    constructor(address _oracle) {
        insurer = msg.sender;
        oracle  = _oracle;
    }

    function setOracle(address _oracle) external onlyInsurer {
        oracle = _oracle;
    }

    /**
     * Suscribe una póliza. Llamado por el backend de Yunta cuando el agricultor
     * compra el seguro (prima descontada del subsidio o del crédito).
     */
    function createPolicy(
        bytes32 policyId,
        bytes32 producerId,
        int256  gpsLat,
        int256  gpsLng,
        uint256 rainThresholdMm,
        uint256 coverageAmount,
        uint256 periodStart,
        uint256 periodEnd
    ) external onlyInsurer {
        policies[policyId] = Policy({
            producerId: producerId,
            gpsLat: gpsLat,
            gpsLng: gpsLng,
            rainThresholdMm: rainThresholdMm,
            coverageAmount: coverageAmount,
            periodStart: periodStart,
            periodEnd: periodEnd,
            status: PolicyStatus.Active
        });
        emit PolicyCreated(policyId, producerId, coverageAmount);
    }

    /**
     * TRIGGER PARAMÉTRICO. El oráculo entrega la lectura del SENAMHI para la
     * estación más cercana al polígono del agricultor. Si la lluvia acumulada
     * cae bajo el umbral, o hay un evento declarado (ej. Ciclón Yaku), el
     * contrato se AUTOEJECUTA: no hay ajustador, no hay reclamo manual.
     *
     * El contrato no paga cripto; emite PayoutTriggered y el backend liquida
     * en soles. La separación on-chain (decide) / off-chain (paga) es el núcleo
     * del modelo híbrido.
     */
    function reportWeather(
        bytes32 policyId,
        uint256 accumulatedRainMm,
        EventType declaredEvent
    ) external onlyOracle {
        Policy storage p = policies[policyId];
        if (p.status != PolicyStatus.Active) revert PolicyNotActive();
        if (block.timestamp < p.periodStart || block.timestamp > p.periodEnd) revert OutsidePeriod();

        bool drought = accumulatedRainMm < p.rainThresholdMm;
        bool catastrophe = declaredEvent != EventType.None;

        if (drought || catastrophe) {
            p.status = PolicyStatus.Triggered;
            EventType et = catastrophe ? declaredEvent : EventType.Drought;
            emit PayoutTriggered(policyId, p.producerId, p.coverageAmount, et);
        }
    }

    /**
     * El backend confirma que la liquidación fiat (TAPP/CCE) ya salió, cerrando
     * el ciclo on-chain ↔ off-chain para la auditoría.
     */
    function confirmPaidOut(bytes32 policyId) external onlyInsurer {
        Policy storage p = policies[policyId];
        if (p.status != PolicyStatus.Triggered) revert PolicyNotActive();
        p.status = PolicyStatus.PaidOut;
    }

    function expirePolicy(bytes32 policyId) external {
        Policy storage p = policies[policyId];
        if (p.status != PolicyStatus.Active) revert PolicyNotActive();
        if (block.timestamp <= p.periodEnd) revert OutsidePeriod();
        p.status = PolicyStatus.Expired;
        emit PolicyExpired(policyId);
    }
}
