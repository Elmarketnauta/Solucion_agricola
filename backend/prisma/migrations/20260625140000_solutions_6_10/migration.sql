-- ============================================================================
-- Yunta-Agro — Capa Precursora (Soluciones 6–10). Developed by Marketnauta
-- Identidad PPA completa, parcelas georreferenciadas, sync offline, telemetría
-- de drones, alertas de riesgo, subsidios TAPP y genética mejorada. Sin Web3.
-- ============================================================================

-- ── Solución 7: ProducerProfile — identidad PPA completa ─────────────────────
ALTER TABLE "ProducerProfile" ADD COLUMN "agroDigitalId" TEXT;
ALTER TABLE "ProducerProfile" ADD COLUMN "ppaIngestedAt" TIMESTAMP(3);
ALTER TABLE "ProducerProfile" ADD COLUMN "identityHash" TEXT;
ALTER TABLE "ProducerProfile" ADD COLUMN "legalParcelCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProducerProfile" ADD COLUMN "verifiedHectares" DOUBLE PRECISION NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "ProducerProfile_agroDigitalId_key" ON "ProducerProfile"("agroDigitalId");

-- ── Solución 10: CampaignInput — clase de semilla / genética ─────────────────
ALTER TABLE "CampaignInput" ADD COLUMN "seedClass" TEXT;
ALTER TABLE "CampaignInput" ADD COLUMN "geneticTrait" TEXT;

-- ── Solución 7: parcelas georreferenciadas ───────────────────────────────────
CREATE TABLE "AgroParcel" (
    "id" SERIAL NOT NULL,
    "producerId" INTEGER NOT NULL,
    "parcelCode" TEXT NOT NULL,
    "hectares" DOUBLE PRECISION NOT NULL,
    "gpsLat" DOUBLE PRECISION NOT NULL,
    "gpsLng" DOUBLE PRECISION NOT NULL,
    "district" TEXT,
    "province" TEXT,
    "region" TEXT,
    "landTenure" TEXT NOT NULL DEFAULT 'Owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgroParcel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgroParcel_producerId_parcelCode_key" ON "AgroParcel"("producerId", "parcelCode");
CREATE INDEX "AgroParcel_producerId_idx" ON "AgroParcel"("producerId");
ALTER TABLE "AgroParcel" ADD CONSTRAINT "AgroParcel_producerId_fkey"
    FOREIGN KEY ("producerId") REFERENCES "ProducerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Solución 9: telemetría de drones ─────────────────────────────────────────
CREATE TABLE "DroneTelemetryCache" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "ndvi" DOUBLE PRECISION,
    "ndre" DOUBLE PRECISION,
    "canopyTempC" DOUBLE PRECISION,
    "thermalStress" BOOLEAN NOT NULL DEFAULT false,
    "diseaseDetected" BOOLEAN NOT NULL DEFAULT false,
    "diseaseLabel" TEXT,
    "fruitMaturityPct" DOUBLE PRECISION,
    "affectedAreaPct" DOUBLE PRECISION,
    "payloadHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DroneTelemetryCache_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DroneTelemetryCache_campaignId_idx" ON "DroneTelemetryCache"("campaignId");
CREATE INDEX "DroneTelemetryCache_flightId_idx" ON "DroneTelemetryCache"("flightId");
ALTER TABLE "DroneTelemetryCache" ADD CONSTRAINT "DroneTelemetryCache_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Alertas de riesgo a nivel de productor ───────────────────────────────────
CREATE TABLE "RiskAlert" (
    "id" SERIAL NOT NULL,
    "producerId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'Warning',
    "message" TEXT NOT NULL,
    "riskDelta" INTEGER NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiskAlert_producerId_idx" ON "RiskAlert"("producerId");
CREATE INDEX "RiskAlert_resolved_idx" ON "RiskAlert"("resolved");
ALTER TABLE "RiskAlert" ADD CONSTRAINT "RiskAlert_producerId_fkey"
    FOREIGN KEY ("producerId") REFERENCES "ProducerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Solución 6: subsidios gubernamentales vía TAPP ───────────────────────────
CREATE TABLE "GovSubsidyDisbursement" (
    "id" SERIAL NOT NULL,
    "programCode" TEXT NOT NULL,
    "beneficiaryPhone" TEXT NOT NULL,
    "beneficiaryDni" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "rail" TEXT NOT NULL DEFAULT 'TAPP',
    "bcrpReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Settled',
    "ledgerTxId" INTEGER,
    "disbursedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovSubsidyDisbursement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovSubsidyDisbursement_bcrpReference_key" ON "GovSubsidyDisbursement"("bcrpReference");
CREATE INDEX "GovSubsidyDisbursement_beneficiaryPhone_idx" ON "GovSubsidyDisbursement"("beneficiaryPhone");
CREATE INDEX "GovSubsidyDisbursement_programCode_idx" ON "GovSubsidyDisbursement"("programCode");
