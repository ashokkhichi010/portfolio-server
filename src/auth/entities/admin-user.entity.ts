import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class AdminUser {
  @Prop({ type: String, required: true, unique: true, index: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, required: true })
  passwordHash: string;

  @Prop({ type: String, enum: ['ADMIN'], default: 'ADMIN' })
  role: 'ADMIN';

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: String, default: '' })
  displayName: string;
}

export type AdminUserDocument = HydratedDocument<AdminUser>;

export const adminUserCollection = 'admin_users';
export const adminUserSchema = SchemaFactory.createForClass(AdminUser);
