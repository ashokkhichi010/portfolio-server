import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from 'src/auth/admin-jwt-auth.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeviceService } from './device.service';

@Controller('admin/devices')
@UseGuards(AdminJwtAuthGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post('register')
  register(
    @Req() req: { user: { sub: string } },
    @Body() payload: RegisterDeviceDto,
  ) {
    return this.deviceService.registerAdminDevice(req.user.sub, payload);
  }
}
