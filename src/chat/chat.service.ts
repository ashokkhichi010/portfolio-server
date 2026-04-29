import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { ChatMessage, ChatSession, ChatSessionDocument } from './entities/chat-session.entity';

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

export interface PersistedChatMessage {
  id: string;
  role: 'visitor' | 'assistant';
  content: string;
  createdAt: string;
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

  async getSessionBySocketId(socketId: string): Promise<ChatSessionDocument | null> {
    return await this.chatSessionModel.findOne({ socketId });
  }

  async appendMessage(
    sessionId: string,
    message: Omit<ChatMessage, 'createdAt'> & { createdAt?: Date },
  ): Promise<PersistedChatMessage> {
    const createdAt = message.createdAt ?? new Date();

    await this.chatSessionModel.updateOne(
      { sessionId },
      {
        $push: {
          messages: {
            $each: [
              {
                id: message.id,
                role: message.role,
                content: message.content,
                createdAt,
              },
            ],
            $slice: -100,
          },
        },
      },
    );

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: createdAt.toISOString(),
    };
  }

  async setHandoverOffered(sessionId: string, handoverOffered: boolean): Promise<void> {
    await this.chatSessionModel.updateOne({ sessionId }, { $set: { handoverOffered } });
  }

  serializeMessages(messages: ChatMessage[] = []): PersistedChatMessage[] {
    return messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));
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
