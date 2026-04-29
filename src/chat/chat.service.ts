import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { ChatSession, ChatSessionDocument } from './entities/chat-session.entity';

export interface ChatDeviceInfoPayload {
  userAgent?: string;
  language?: string;
  platform?: string;
  screen?: string;
  timezone?: string;
}

export interface RestoreSessionResult {
  session: ChatSessionDocument;
  isRestored: boolean;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatSessionModel: Model<ChatSessionDocument>,
  ) {}

  async createOrRestoreSession(
    sessionId: string | undefined,
    socketId: string,
    deviceInfo: ChatDeviceInfoPayload | undefined,
  ): Promise<RestoreSessionResult> {
    const sanitizedDeviceInfo = this.sanitizeDeviceInfo(deviceInfo);
    const nextConnectionAt = new Date();

    if (sessionId) {
      const restoredSession = await this.chatSessionModel.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            socketId,
            connectionStatus: 'CONNECTED',
            connectedAt: nextConnectionAt,
            disconnectedAt: null,
            deviceInfo: sanitizedDeviceInfo,
          },
        },
        { new: true },
      );

      if (restoredSession) {
        return { session: restoredSession, isRestored: true };
      }
    }

    const createdSession = await this.chatSessionModel.create({
      sessionId: randomUUID(),
      socketId,
      connectionStatus: 'CONNECTED',
      connectedAt: nextConnectionAt,
      disconnectedAt: null,
      deviceInfo: sanitizedDeviceInfo,
    });

    return { session: createdSession, isRestored: false };
  }

  async disconnectSession(socketId: string): Promise<void> {
    await this.chatSessionModel.updateOne(
      { socketId },
      {
        $set: {
          connectionStatus: 'DISCONNECTED',
          disconnectedAt: new Date(),
          socketId: '',
        },
      },
    );
  }

  private sanitizeDeviceInfo(deviceInfo: ChatDeviceInfoPayload | undefined) {
    return {
      userAgent: deviceInfo?.userAgent ?? '',
      language: deviceInfo?.language ?? '',
      platform: deviceInfo?.platform ?? '',
      screen: deviceInfo?.screen ?? '',
      timezone: deviceInfo?.timezone ?? '',
    };
  }
}
