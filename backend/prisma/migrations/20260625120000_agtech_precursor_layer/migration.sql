-- ============================================================================
-- Yunta-Agro — Capa Precursora AgTech (Web2 / off-chain)
-- Developed by Marketnauta
-- Migración incremental: telemetría IoT, alertas, oráculo climático centralizado,
-- y ampliación de InsurancePolicy + CertificationToken para seguros paramétricos
-- y trazabilidad EUDR. Sin Solidity, sin Web3: todo en PostgreSQL.
-- ============================================================================

-- ── CertificationToken: pasaporte EUDR (GPS + PPA + hash inmutable) ──────────
ALTER TABLE "CertificationToken" ADD COLUMN "certUuid" TEXT;
UPDATE "CertificationToken" SET "certUuid" = gen_random_uuid()::text WHERE "certUuid" IS NULL;
ALTER TABLE "CertificationToken" ALTER COLUMN "certUuid" SET NOT NULL;
ALTER TABLE "CertificationToken" ADD COLUMN "gpsLat" DOUBLE PRECISION;
ALTER TABLE "CertificationToken" ADD COLUMN "gpsLng" DOUBLE PRECISION;
ALTER TABLE "CertificationToken" ADD COLUMN "region" TEXT;
ALTER TABLE "CertificationToken" ADD COLUMN "cropType" TEXT;
ALTER TABLE "CertificationToken" ADD COLUMN "ppaCode" TEXT;
ALTER TABLE "CertificationToken" ADD COLUMN "certifiedPayload" TEXT;

CREATE UNIQUE INDEX "CertificationToken_certUuid_key" ON "CertificationToken"("certUuid");
CREATE INDEX "CertificationToken_certUuid_idx" ON "CertificationToken"("certUuid");

-- ── InsurancePolicy: parámetros del disparador climático ─────────────────────
ALTER TABLE "InsurancePolicy" ADD COLUMN "tempMaxThreshold" DOUBLE PRECISION;
ALTER TABLE "InsurancePolicy" ADD COLUMN "tempMinThreshold" DOUBLE PRECISION;
ALTER TABLE "InsurancePolicy" ADD COLUMN "stationKey" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "InsurancePolicy" ADD COLUMN "triggeredAt" TIMESTAMP(3);
ALTER TABLE "InsurancePolicy" ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3);

CREATE INDEX "InsurancePolicy_stationKey_idx" ON "InsurancePolicy"("stationKey");

-- ── IoTSensorTelemetry ───────────────────────────────────────────────────────
CREATE TABLE "IoTSensorTelemetry" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "soilMoisturePct" DOUBLE PRECISION,
    "soilTempC" DOUBLE PRECISION,
    "airTempC" DOUBLE PRECISION,
    "humidityPct" DOUBLE PRECISION,
    "batteryPct" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IoTSensorTelemetry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IoTSensorTelemetry_campaignId_idx" ON "IoTSensorTelemetry"("campaignId");
CREATE INDEX "IoTSensorTelemetry_deviceId_idx" ON "IoTSensorTelemetry"("deviceId");
CREATE INDEX "IoTSensorTelemetry_recordedAt_idx" ON "IoTSensorTelemetry"("recordedAt");
ALTER TABLE "IoTSensorTelemetry" ADD CONSTRAINT "IoTSensorTelemetry_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── AgroAlert ────────────────────────────────────────────────────────────────
CREATE TABLE "AgroAlert" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'Warning',
    "message" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgroAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgroAlert_campaignId_idx" ON "AgroAlert"("campaignId");
CREATE INDEX "AgroAlert_type_idx" ON "AgroAlert"("type");
CREATE INDEX "AgroAlert_acknowledged_idx" ON "AgroAlert"("acknowledged");
ALTER TABLE "AgroAlert" ADD CONSTRAINT "AgroAlert_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OracleWeatherDataCache ───────────────────────────────────────────────────
CREATE TABLE "OracleWeatherDataCache" (
    "id" SERIAL NOT NULL,
    "stationKey" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tempMaxC" DOUBLE PRECISION NOT NULL,
    "tempMinC" DOUBLE PRECISION NOT NULL,
    "tempAvgC" DOUBLE PRECISION NOT NULL,
    "precipitationMm" DOUBLE PRECISION NOT NULL,
    "humidityPct" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'SENAMHI_SIM',
    "payloadHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OracleWeatherDataCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OracleWeatherDataCache_stationKey_date_key" ON "OracleWeatherDataCache"("stationKey", "date");
CREATE INDEX "OracleWeatherDataCache_stationKey_idx" ON "OracleWeatherDataCache"("stationKey");
CREATE INDEX "OracleWeatherDataCache_date_idx" ON "OracleWeatherDataCache"("date");
