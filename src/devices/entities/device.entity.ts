import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Device {
  @Prop({ type: String, required: true, index: true })
  adminId: string;

  @Prop({ type: String, required: true, index: true })
  deviceId: string;

  @Prop({ type: String, required: true })
  fcmToken: string;

  @Prop({ type: String, default: '' })
  platform: string;

  @Prop({ type: String, default: '' })
  userAgent: string;

  @Prop({ type: Date, default: Date.now })
  lastSeenAt: Date;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;
}

export type DeviceDocument = HydratedDocument<Device>;

export const deviceCollection = 'devices';
export const deviceSchema = SchemaFactory.createForClass(Device);
