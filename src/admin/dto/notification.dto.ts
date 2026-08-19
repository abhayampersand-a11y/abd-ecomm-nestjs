import {
  NotificationAudience,
  NotificationSegment,
  NotificationStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class CreateNotificationDto {
  /**
   * Android na notification tray ma lagbhag 40-50 akshar j dekhaay chhe.
   * Had 100 rakhi chhe (moti screens mate jagya rahe), pan panel e admin ne
   * preview batavvu — API had thi lambu kaapse nahi, e app nu kaam chhe.
   */
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  /**
   * "product:blue-saree" | "collection:sarees" | "order:PBG1036" |
   * "url:https://..." — parse app kare chhe.
   *
   * ⚠️ Aa ne validate aapne nathi karta. Khoto deep link no matlab chhe ke
   * grahak notification dabaave ane app home par khule — kharaab, pan campaign
   * rokvi e enathi vadhu kharaab chhe.
   */
  @IsOptional()
  @trim
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;

  /** audience = SEGMENT hoy tyare farjiyat */
  @IsOptional()
  @IsEnum(NotificationSegment)
  segment?: NotificationSegment;

  /** audience = CUSTOMER hoy tyare farjiyat */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Bharo etle status SCHEDULED thai jaay chhe ane cron ene uthaave chhe
   * (`POST /admin/notifications/dispatch-due`). Khaali rakho to DRAFT rahe
   * chhe — mokalva mate `/send` dabaavvu pade.
   */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

export class UpdateNotificationDto {
  @IsOptional()
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body?: string;

  @IsOptional()
  @trim
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;

  @IsOptional()
  @IsEnum(NotificationSegment)
  segment?: NotificationSegment;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

export class ListNotificationsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}

/** Mokalva pehla: "aa ketla loko sudhi jashe?" */
export class EstimateAudienceDto {
  @IsEnum(NotificationAudience)
  audience!: NotificationAudience;

  @IsOptional()
  @IsEnum(NotificationSegment)
  segment?: NotificationSegment;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class CreateTemplateDto {
  /** Panel ma dropdown ma aa dekhaay chhe — "Order shipped", "Sale live" */
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @trim
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body?: string;

  @IsOptional()
  @trim
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;
}
