import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { customConfig } from 'src/config/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAdminStrategy } from './jwt-admin.strategy';
import {
  AdminLoginOtp,
  adminLoginOtpCollection,
  adminLoginOtpSchema,
} from './entities/admin-login-otp.entity';
import {
  AdminRefreshToken,
  adminRefreshTokenCollection,
  adminRefreshTokenSchema,
} from './entities/admin-refresh-token.entity';
import { AdminUser, adminUserCollection, adminUserSchema } from './entities/admin-user.entity';
import { MailService } from './mail.service';

@Module({
  imports: [
    JwtModule.register({
      secret: customConfig().JWT.SECRET,
    }),
    MongooseModule.forFeature([
      { name: AdminUser.name, schema: adminUserSchema, collection: adminUserCollection },
      { name: AdminLoginOtp.name, schema: adminLoginOtpSchema, collection: adminLoginOtpCollection },
      {
        name: AdminRefreshToken.name,
        schema: adminRefreshTokenSchema,
        collection: adminRefreshTokenCollection,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAdminStrategy, MailService],
  exports: [AuthService],
})
export class AuthModule {}
