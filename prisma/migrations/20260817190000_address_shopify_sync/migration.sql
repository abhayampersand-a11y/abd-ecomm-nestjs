-- Address ne Shopify na customer address book sathe jodva mate.
--
-- shopifyAddressId : Shopify ma aa address no id (numeric, gid nahi).
--                    Null = haju Shopify sudhi gayo nathi.
-- syncedAt         : chhelli safal sync. Null + shopifyAddressId null
--                    = push baaki chhe (retry aa par thi khabar pade chhe).

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "shopifyAddressId" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "addresses_shopifyAddressId_key" ON "addresses"("shopifyAddressId");
