import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * ⚠️ /admin/* na DAR controller par aa lagaadvo.
 *
 * Grahak vaalo `JwtAuthGuard` ahiya kaam nahi kare ane ultu pan nahi — be
 * strategies na naam alag chhe ('jwt' vs 'admin-jwt'), etle bhulthi badlaai
 * jaay to request 401 thai jashe, chup-chaap pass nahi thay.
 */
@Injectable()
export class AdminJwtGuard extends AuthGuard('admin-jwt') {}
