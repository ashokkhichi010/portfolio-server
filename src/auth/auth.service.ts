import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { customConfig } from 'src/config/config';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLoginOtp, AdminLoginOtpDocument } from './entities/admin-login-otp.entity';
import { AdminRefreshToken, AdminRefreshTokenDocument } from './entities/admin-refresh-token.entity';
import { AdminUser, AdminUserDocument } from './entities/admin-user.entity';
import { MailService } from './mail.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectModel(AdminUser.name) private readonly adminUserModel: Model<AdminUserDocument>,
    @InjectModel(AdminLoginOtp.name) private readonly otpModel: Model<AdminLoginOtpDocument>,
    @InjectModel(AdminRefreshToken.name)
    private readonly refreshTokenModel: Model<AdminRefreshTokenDocument>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminConfig = customConfig().ADMIN;
    if (!adminConfig.EMAIL || !adminConfig.PASSWORD) {
      return;
    }

    const existing = await this.adminUserModel.findOne({ email: adminConfig.EMAIL.toLowerCase().trim() });
    if (existing) {
      return;
    }

    await this.adminUserModel.create({
      email: adminConfig.EMAIL.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(adminConfig.PASSWORD, customConfig().BCRYPT_SALT),
      role: 'ADMIN',
      isActive: true,
      displayName: adminConfig.DISPLAY_NAME ?? 'Portfolio Admin',
    });
  }

  async loginAdmin(payload: AdminLoginDto) {
    const admin = await this.adminUserModel.findOne({ email: payload.email.toLowerCase().trim() });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isValidPassword = await bcrypt.compare(payload.password, admin.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpToken = randomUUID();
    const expiresAt = new Date(Date.now() + customConfig().OTP_EXPIRES_MINUTES * 60 * 1000);
    const otpHash = await bcrypt.hash(otp, customConfig().BCRYPT_SALT);

    await this.otpModel.deleteMany({ adminId: admin.id });
    await this.otpModel.create({
      otpToken,
      adminId: admin.id,
      otpHash,
      expiresAt,
      isUsed: false,
    });

    await this.mailService.sendAdminOtp(admin.email, otp);

    return {
      otpToken,
      expiresAt: expiresAt.toISOString(),
      requires2fa: true,
    };
  }

  async verifyAdminOtp(otpToken: string, otp: string) {
    const otpRecord = await this.otpModel.findOne({ otpToken });
    if (!otpRecord || otpRecord.isUsed || otpRecord.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    const isValidOtp = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValidOtp) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    otpRecord.isUsed = true;
    await otpRecord.save();

    const admin = await this.adminUserModel.findById(otpRecord.adminId);
    if (!admin || !admin.isActive) {
      throw new NotFoundException('Admin user not found.');
    }

    const tokens = await this.issueAdminTokens(admin);

    return {
      ...tokens,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        displayName: admin.displayName,
      },
    };
  }

  async refreshAdminTokens(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const admin = await this.adminUserModel.findById(payload.sub);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin session is invalid.');
    }

    const tokenRecord = await this.refreshTokenModel.findOne({
      adminId: admin.id,
      tokenId: payload.tokenId,
      revoked: false,
    });

    if (!tokenRecord || tokenRecord.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    const matches = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    tokenRecord.revoked = true;
    await tokenRecord.save();

    return await this.issueAdminTokens(admin);
  }

  async logoutAdmin(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.refreshTokenModel.updateOne(
      { adminId: payload.sub, tokenId: payload.tokenId, revoked: false },
      { $set: { revoked: true } },
    );

    return { success: true };
  }

  async validateAdminAccessToken(accessToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(accessToken, {
        secret: customConfig().JWT.SECRET,
      });

      if (payload.type !== 'access' || payload.role !== 'ADMIN') {
        throw new UnauthorizedException('Invalid admin token.');
      }

      const admin = await this.adminUserModel.findById(payload.sub);
      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin account is not available.');
      }

      return {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        displayName: admin.displayName,
      };
    } catch {
      throw new UnauthorizedException('Invalid admin token.');
    }
  }

  private async issueAdminTokens(admin: AdminUserDocument) {
    const accessPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'access',
    } as const;

    const tokenId = randomUUID();
    const refreshPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tokenId,
      type: 'refresh',
      nonce: randomBytes(12).toString('hex'),
    } as const;

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: customConfig().JWT.SECRET,
      expiresIn: (customConfig().JWT.ACCESS_EXPIRATION_MINUTES || '15m') as never,
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: customConfig().JWT.SECRET,
      expiresIn: (customConfig().JWT.REFRESH_EXPIRATION_DAYS || '30d') as never,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, customConfig().BCRYPT_SALT);
    const refreshExpiry = new Date(Date.now() + this.getRefreshExpiryMs());

    await this.refreshTokenModel.create({
      adminId: admin.id,
      tokenId,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiry,
      revoked: false,
    });

    return { accessToken, refreshToken };
  }

  private getRefreshExpiryMs(): number {
    const configured = customConfig().JWT.REFRESH_EXPIRATION_DAYS;
    const days = Number(String(configured ?? '30d').replace(/d$/i, ''));
    return (Number.isFinite(days) && days > 0 ? days : 30) * 24 * 60 * 60 * 1000;
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: customConfig().JWT.SECRET,
      });

      if (payload.type !== 'refresh' || payload.role !== 'ADMIN') {
        throw new ForbiddenException('Refresh token is invalid.');
      }

      return payload as { sub: string; tokenId: string; role: 'ADMIN'; type: 'refresh' };
    } catch {
      throw new UnauthorizedException('Refresh token is invalid.');
    }
  }
}
