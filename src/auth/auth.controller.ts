import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLogoutDto } from './dto/admin-logout.dto';
import { AdminRefreshDto } from './dto/admin-refresh.dto';
import { AdminVerifyOtpDto } from './dto/admin-verify-otp.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('auth-admin')
@Controller('auth/admin')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: AdminLoginDto) {
    return this.authService.loginAdmin(payload);
  }

  @Post('verify')
  verify(@Body() payload: AdminVerifyOtpDto) {
    return this.authService.verifyAdminOtp(payload.otpToken, payload.otp);
  }

  @Post('refresh')
  refresh(@Body() payload: AdminRefreshDto) {
    return this.authService.refreshAdminTokens(payload.refreshToken);
  }

  @Post('logout')
  logout(@Body() payload: AdminLogoutDto) {
    return this.authService.logoutAdmin(payload.refreshToken);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('me')
  me(@Req() req: { user: { sub: string; email: string; role: 'ADMIN' } }) {
    return req.user;
  }
}
