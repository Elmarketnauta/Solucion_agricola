-- CreateTable
CREATE TABLE "MerchantProfile" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ruc" TEXT,
    "dni" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "pin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "saasTier" TEXT NOT NULL DEFAULT 'Free',
    "mdrRate" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "txSignature" TEXT NOT NULL,
    "senderPhone" TEXT,
    "receiverPhone" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "type" TEXT NOT NULL,
    "interoperableSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Initiated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLedger" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLine" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "utilizedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "interestRateEffective" DOUBLE PRECISION NOT NULL,
    "alternativeScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" SERIAL NOT NULL,
    "creditLineId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Unpaid',

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProducerProfile" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "dni" TEXT NOT NULL,
    "ppaVerified" BOOLEAN NOT NULL DEFAULT false,
    "ppaCode" TEXT,
    "hectares" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "region" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "mainCrop" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroCampaign" (
    "id" SERIAL NOT NULL,
    "producerId" INTEGER NOT NULL,
    "crop" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "inputCostTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "harvestWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyerName" TEXT,
    "salePricePerKg" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Planted',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "harvestedAt" TIMESTAMP(3),

    CONSTRAINT "AgroCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInput" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidWith" TEXT NOT NULL DEFAULT 'Subsidy',

    CONSTRAINT "CampaignInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificationToken" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "producerId" INTEGER NOT NULL,
    "productKg" DOUBLE PRECISION NOT NULL,
    "buyerRuc" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "deductiblePct" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "vcHash" TEXT NOT NULL,
    "chainTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Issued',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubsidyDisbursement" (
    "id" SERIAL NOT NULL,
    "producerId" INTEGER NOT NULL,
    "program" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "spentOnInputs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Disbursed',
    "disbursedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubsidyDisbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" SERIAL NOT NULL,
    "producerId" INTEGER NOT NULL,
    "chainPolicyId" TEXT NOT NULL,
    "crop" TEXT NOT NULL,
    "gpsLat" DOUBLE PRECISION NOT NULL,
    "gpsLng" DOUBLE PRECISION NOT NULL,
    "rainThresholdMm" DOUBLE PRECISION NOT NULL,
    "coverageAmount" DOUBLE PRECISION NOT NULL,
    "premium" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "triggeredEventType" TEXT,
    "payoutTxId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSignedTx" (
    "id" SERIAL NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "producerPhone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "receivedVia" TEXT NOT NULL DEFAULT 'Sync',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "OfflineSignedTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_uuid_key" ON "MerchantProfile"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_phoneNumber_key" ON "MerchantProfile"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_email_key" ON "MerchantProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_merchantId_key" ON "Wallet"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txSignature_key" ON "Transaction"("txSignature");

-- CreateIndex
CREATE INDEX "Transaction_senderPhone_idx" ON "Transaction"("senderPhone");

-- CreateIndex
CREATE INDEX "Transaction_receiverPhone_idx" ON "Transaction"("receiverPhone");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLine_merchantId_key" ON "CreditLine"("merchantId");

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

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_senderPhone_fkey" FOREIGN KEY ("senderPhone") REFERENCES "MerchantProfile"("phoneNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receiverPhone_fkey" FOREIGN KEY ("receiverPhone") REFERENCES "MerchantProfile"("phoneNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedger" ADD CONSTRAINT "SalesLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLine" ADD CONSTRAINT "CreditLine_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_creditLineId_fkey" FOREIGN KEY ("creditLineId") REFERENCES "CreditLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerProfile" ADD CONSTRAINT "ProducerProfile_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroCampaign" ADD CONSTRAINT "AgroCampaign_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInput" ADD CONSTRAINT "CampaignInput_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationToken" ADD CONSTRAINT "CertificationToken_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgroCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationToken" ADD CONSTRAINT "CertificationToken_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubsidyDisbursement" ADD CONSTRAINT "SubsidyDisbursement_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

