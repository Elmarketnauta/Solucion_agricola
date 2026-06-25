-- CreateTable
CREATE TABLE "ProducerProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "merchantId" INTEGER NOT NULL,
    "dni" TEXT NOT NULL,
    "ppaVerified" BOOLEAN NOT NULL DEFAULT false,
    "ppaCode" TEXT,
    "hectares" REAL NOT NULL DEFAULT 0,
    "region" TEXT,
    "gpsLat" REAL,
    "gpsLng" REAL,
    "mainCrop" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProducerProfile_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgroCampaign" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "producerId" INTEGER NOT NULL,
    "crop" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "inputCostTotal" REAL NOT NULL DEFAULT 0,
    "harvestWeightKg" REAL NOT NULL DEFAULT 0,
    "buyerName" TEXT,
    "salePricePerKg" REAL,
    "status" TEXT NOT NULL DEFAULT 'Planted',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "harvestedAt" DATETIME,
    CONSTRAINT "AgroCampaign_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignInput" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidWith" TEXT NOT NULL DEFAULT 'Subsidy',
    CONSTRAINT "CampaignInput_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificationToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "producerId" INTEGER NOT NULL,
    "productKg" REAL NOT NULL,
    "buyerRuc" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "deductiblePct" REAL NOT NULL DEFAULT 0.25,
    "vcHash" TEXT NOT NULL,
    "chainTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Issued',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificationToken_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CertificationToken_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubsidyDisbursement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "producerId" INTEGER NOT NULL,
    "program" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "spentOnInputs" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Disbursed',
    "disbursedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubsidyDisbursement_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "producerId" INTEGER NOT NULL,
    "chainPolicyId" TEXT NOT NULL,
    "crop" TEXT NOT NULL,
    "gpsLat" REAL NOT NULL,
    "gpsLng" REAL NOT NULL,
    "rainThresholdMm" REAL NOT NULL,
    "coverageAmount" REAL NOT NULL,
    "premium" REAL NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "triggeredEventType" TEXT,
    "payoutTxId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsurancePolicy_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfflineSignedTx" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "idempotencyKey" TEXT NOT NULL,
    "producerPhone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "receivedVia" TEXT NOT NULL DEFAULT 'Sync',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "ProducerProfile_merchantId_key" ON "ProducerProfile"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProducerProfile_dni_key" ON "ProducerProfile"("dni");

-- CreateIndex
CREATE INDEX "AgroCampaign_producerId_idx" ON "AgroCampaign"("producerId");

-- CreateIndex
CREATE INDEX "CampaignInput_campaignId_idx" ON "CampaignInput"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificationToken_campaignId_key" ON "CertificationToken"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificationToken_vcHash_key" ON "CertificationToken"("vcHash");

-- CreateIndex
CREATE INDEX "CertificationToken_producerId_idx" ON "CertificationToken"("producerId");

-- CreateIndex
CREATE INDEX "CertificationToken_buyerRuc_idx" ON "CertificationToken"("buyerRuc");

-- CreateIndex
CREATE INDEX "SubsidyDisbursement_producerId_idx" ON "SubsidyDisbursement"("producerId");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePolicy_chainPolicyId_key" ON "InsurancePolicy"("chainPolicyId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_producerId_idx" ON "InsurancePolicy"("producerId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_status_idx" ON "InsurancePolicy"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSignedTx_idempotencyKey_key" ON "OfflineSignedTx"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OfflineSignedTx_producerPhone_idx" ON "OfflineSignedTx"("producerPhone");

-- CreateIndex
CREATE INDEX "OfflineSignedTx_status_idx" ON "OfflineSignedTx"("status");

