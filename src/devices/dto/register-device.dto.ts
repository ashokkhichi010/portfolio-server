import { IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  deviceId: string;

  @IsString()
  fcmToken: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
