import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * Be Customer records ek j vyakti na chhe — ene ek karo.
 *
 * `source` MERGED thai jaay chhe ane `target` ne point kare chhe. Delete
 * kyarey nathi thato: juna orders, addresses ane audit trail ene jodayela
 * chhe, ane login pan `mergedIntoId` ni chain vaanchi ne target sudhi
 * pahonchi jaay chhe.
 */
export class MergeCustomersDto {
  /** Aa record MERGED thashe (duplicate) */
  @IsUUID()
  sourceCustomerId!: string;

  /** Aa record chaalu rahese (asli) */
  @IsUUID()
  targetCustomerId!: string;

  /**
   * Merge undo nathi thai shakto. Panel e pehla `dryRun: true` thi
   * "su-su khasse" e batavvu, ane pachhi j kharekhar chalavvu.
   */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
