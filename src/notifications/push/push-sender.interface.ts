import type { DevicePlatform } from '@prisma/client';

/**
 * Push mokalvani EK j jagya — `OtpSender` jevi j gaadh.
 *
 * FCM/APNs no code aakhi app ma kyaay na aavvo joiye. Aavse to ek din
 * provider badalvo hoy tyare 8 files sudharvi padse ane koi ek rahi jashe.
 */
export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushMessage {
  token: string;
  platform: DevicePlatform;
  title: string;
  body: string;
  /** "product:blue-saree" jevu — app parse kare chhe */
  deepLink?: string | null;
  imageUrl?: string | null;
}

export interface PushResult {
  token: string;
  ok: boolean;
  error?: string;
  /**
   * `true` = aa token have kyarey kaam nahi kare (app uninstall thai, ke
   * token badlai gayo). Aava tokens DB mathi kaadhi naakhvana chhe.
   *
   * Aa flag vagar table mahina ma mareli entries thi bharai jaay chhe, ane
   * dar campaign e e badhi par prayatn thay chhe — dhimu ane khotu banne.
   */
  invalidToken?: boolean;
}

export interface PushSender {
  /**
   * Ek batch mokle chhe.
   *
   * ⚠️ Aa method KYAREY throw na kare. Ek device fail thay etle aakho
   * campaign band na padvo joiye — dar message no javaab alag alag
   * `PushResult` ma aave chhe.
   */
  send(messages: PushMessage[]): Promise<PushResult[]>;
}
