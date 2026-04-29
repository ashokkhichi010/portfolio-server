import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Device, DeviceDocument } from './entities/device.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DeviceService {
  constructor(@InjectModel(Device.name) private readonly deviceModel: Model<DeviceDocument>) {}

  async registerDevice(ownerType: 'admin' | 'visitor', ownerId: string, payload: RegisterDeviceDto) {
    await this.deviceModel.findOneAndUpdate(
      { ownerType, ownerId, deviceId: payload.deviceId },
      {
        $set: {
          fcmToken: payload.fcmToken ?? '',
          platform: payload.platform ?? '',
          userAgent: payload.userAgent ?? '',
          language: payload.language ?? '',
          screen: payload.screen ?? '',
          timezone: payload.timezone ?? '',
          lastSeenAt: new Date(),
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );

    return { success: true };
  }

  async getActiveAdminTokens(): Promise<string[]> {
    const devices = await this.deviceModel
      .find({ isActive: true, ownerType: 'admin', fcmToken: { $ne: '' } })
      .sort({ updatedAt: -1 });
    return [...new Set(devices.map((device) => device.fcmToken).filter(Boolean))];
  }

  async getActiveVisitorTokens(ownerId: string): Promise<string[]> {
    const devices = await this.deviceModel.find({
      isActive: true,
      ownerType: 'visitor',
      ownerId,
      fcmToken: { $ne: '' },
    });

    return [...new Set(devices.map((device) => device.fcmToken).filter(Boolean))];
  }

  async deactivateTokens(tokens: string[]) {
    if (!tokens.length) {
      return;
    }

    await this.deviceModel.updateMany({ fcmToken: { $in: tokens } }, { $set: { isActive: false } });
  }
}
