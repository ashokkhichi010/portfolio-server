import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { customConfig } from 'src/config/config';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: 'ADMIN';
  type: 'access';
}

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: customConfig().JWT.SECRET || 'development-secret',
    });
  }

  async validate(payload: AdminJwtPayload): Promise<AdminJwtPayload> {
    return payload;
  }
}
