-- CreateTable
CREATE TABLE "MerchantProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ruc" TEXT,
    "dni" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "saasTier" TEXT NOT NULL DEFAULT 'Free',
    "mdrRate" REAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "merchantId" INTEGER NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0.00,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wallet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "txSignature" TEXT NOT NULL,
    "senderPhone" TEXT,
    "receiverPhone" TEXT,
    "amount" REAL NOT NULL,
    "fee" REAL NOT NULL DEFAULT 0.00,
    "type" TEXT NOT NULL,
    "interoperableSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Initiated',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "Transaction_senderPhone_fkey" FOREIGN KEY ("senderPhone") REFERENCES "MerchantProfile" ("phoneNumber") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_receiverPhone_fkey" FOREIGN KEY ("receiverPhone") REFERENCES "MerchantProfile" ("phoneNumber") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "merchantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesLedger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalAmount" REAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "merchantId" INTEGER NOT NULL,
    "creditLimit" REAL NOT NULL DEFAULT 0.00,
    "utilizedAmount" REAL NOT NULL DEFAULT 0.00,
    "interestRateEffective" REAL NOT NULL,
    "alternativeScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditLine_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "creditLineId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Unpaid',
    CONSTRAINT "LoanInstallment_creditLineId_fkey" FOREIGN KEY ("creditLineId") REFERENCES "CreditLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "CreditLine_merchantId_key" ON "CreditLine"("merchantId");
