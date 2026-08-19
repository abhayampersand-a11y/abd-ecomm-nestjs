-- Un-verified email nu concept kaadhi nakhyu.
--
-- App have registration screen par email maangti j nathi. Email fakt OTP
-- verify thay tyare j aave chhe, ane e `primaryEmail` + `customer_identities`
-- ma jaay chhe. Etle `contactEmail` ne lakhnaru have koi rahyu nathi —
-- na app, na admin panel.

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "contactEmail";
