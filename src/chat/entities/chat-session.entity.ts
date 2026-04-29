import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class ChatDeviceInfo {
  @Prop({ type: String, default: '' })
  userAgent: string;

  @Prop({ type: String, default: '' })
  language: string;

  @Prop({ type: String, default: '' })
  platform: string;

  @Prop({ type: String, default: '' })
  screen: string;

  @Prop({ type: String, default: '' })
  timezone: string;
}

export const chatDeviceInfoSchema = SchemaFactory.createForClass(ChatDeviceInfo);

@Schema({ _id: false })
export class ChatMessage {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, enum: ['visitor', 'assistant'], required: true })
  role: 'visitor' | 'assistant';

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const chatMessageSchema = SchemaFactory.createForClass(ChatMessage);

@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ type: String, required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ type: String, default: '' })
  socketId: string;

  @Prop({ type: String, enum: ['CONNECTED', 'DISCONNECTED'], default: 'CONNECTED' })
  connectionStatus: 'CONNECTED' | 'DISCONNECTED';

  @Prop({ type: Date, default: Date.now })
  connectedAt: Date;

  @Prop({ type: Date, default: null })
  disconnectedAt: Date | null;

  @Prop({ type: chatDeviceInfoSchema, default: {} })
  deviceInfo: ChatDeviceInfo;

  @Prop({ type: [chatMessageSchema], default: [] })
  messages: ChatMessage[];

  @Prop({ type: Boolean, default: false })
  handoverOffered: boolean;
}

export type ChatSessionDocument = HydratedDocument<ChatSession>;

export const chatSessionCollection = 'chat_sessions';
export const chatSessionSchema = SchemaFactory.createForClass(ChatSession);
