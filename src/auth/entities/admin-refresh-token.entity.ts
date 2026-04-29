import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class AdminRefreshToken {
  @Prop({ type: String, required: true, index: true })
  adminId: string;

  @Prop({ type: String, required: true, index: true })
  tokenId: string;

  @Prop({ type: String, required: true })
  tokenHash: string;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  @Prop({ type: Boolean, default: false })
  revoked: boolean;
}

export type AdminRefreshTokenDocument = HydratedDocument<AdminRefreshToken>;

export const adminRefreshTokenCollection = 'admin_refresh_tokens';
export const adminRefreshTokenSchema = SchemaFactory.createForClass(AdminRefreshToken);
