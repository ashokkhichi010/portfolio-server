import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Device, DeviceDocument } from './entities/device.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DeviceService {
  constructor(@InjectModel(Device.name) private readonly deviceModel: Model<DeviceDocument>) {}

  async registerAdminDevice(adminId: string, payload: RegisterDeviceDto) {
    await this.deviceModel.findOneAndUpdate(
      { adminId, deviceId: payload.deviceId },
      {
        $set: {
          fcmToken: payload.fcmToken,
          platform: payload.platform ?? '',
          userAgent: payload.userAgent ?? '',
          lastSeenAt: new Date(),
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );

    return { success: true };
  }

  async getActiveAdminTokens(): Promise<string[]> {
    const devices = await this.deviceModel.find({ isActive: true }).sort({ updatedAt: -1 });
    return [...new Set(devices.map((device) => device.fcmToken).filter(Boolean))];
  }

  async deactivateTokens(tokens: string[]) {
    if (!tokens.length) {
      return;
    }

    await this.deviceModel.updateMany({ fcmToken: { $in: tokens } }, { $set: { isActive: false } });
  }
}
