import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class AdminLoginOtp {
  @Prop({ type: String, required: true, unique: true, index: true })
  otpToken: string;

  @Prop({ type: String, required: true, index: true })
  adminId: string;

  @Prop({ type: String, required: true })
  otpHash: string;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  @Prop({ type: Boolean, default: false })
  isUsed: boolean;
}

export type AdminLoginOtpDocument = HydratedDocument<AdminLoginOtp>;

export const adminLoginOtpCollection = 'admin_login_otps';
export const adminLoginOtpSchema = SchemaFactory.createForClass(AdminLoginOtp);
