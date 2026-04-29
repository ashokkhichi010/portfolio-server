import { IsString, Length } from 'class-validator';

export class AdminVerifyOtpDto {
  @IsString()
  otpToken: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
