import { Module } from '@nestjs/common';
import { InfluencerController } from './influencer.controller';
import { InfluencerService } from './influencer.service';

/**
 * Creator program — grahak ni baaju.
 *
 * Admin ni baaju `AdminModule` ma chhe (alag guard, alag secret), pan `Reel`
 * ane wallet aavya pachhi pan **data ni logic ahiya j rahevi joiye** — nahi
 * to be jagya e be niyamo bani jashe, je AdminModule na potana comment ma pan
 * chetavani tarike lakhelu chhe.
 */
@Module({
  controllers: [InfluencerController],
  providers: [InfluencerService],
  exports: [InfluencerService],
})
export class InfluencerModule {}
