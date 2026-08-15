-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "contactEmail" TEXT;

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "provinceCode" TEXT,
    "zip" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "importedFromOrder" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_customerId_idx" ON "addresses"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_customerId_fingerprint_key" ON "addresses"("customerId", "fingerprint");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
