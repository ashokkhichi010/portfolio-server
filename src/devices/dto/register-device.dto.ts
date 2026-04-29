import { IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  fcmToken: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  screen?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
