import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { ChatMessage, ChatSession, ChatSessionDocument } from './entities/chat-session.entity';

export interface ChatDeviceInfoPayload {
  deviceId?: string;
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
  role: 'visitor' | 'assistant' | 'admin';
  content: string;
  createdAt: string;
}

export interface VerifiedVisitor {
  uid: string;
  email: string;
  name: string;
  photoUrl: string;
}

export interface AdminLeadSummary {
  sessionId: string;
  status: 'AI' | 'HANDOVER_REQUESTED' | 'LIVE' | 'ADMIN_BUSY';
  visitorName: string;
  visitorEmail: string;
  visitorVerified: boolean;
  assignedAdminId: string;
  assignedAdminEmail: string;
  latestMessage: string;
  messages: PersistedChatMessage[];
  handoverRequestedAt: string | null;
  handoverTimeoutAt: string | null;
}

export interface AssignedAdminPayload {
  adminId: string;
  adminEmail: string;
  adminSocketId: string;
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

  async getSessionById(sessionId: string): Promise<ChatSessionDocument | null> {
    return await this.chatSessionModel.findOne({ sessionId });
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

  async verifyVisitor(sessionId: string, visitor: VerifiedVisitor): Promise<void> {
    await this.chatSessionModel.updateOne(
      { sessionId },
      {
        $set: {
          visitorUid: visitor.uid,
          visitorEmail: visitor.email,
          visitorName: visitor.name,
          visitorPhotoUrl: visitor.photoUrl,
          visitorVerified: true,
        },
      },
    );
  }

  async setVisitorNotificationToken(sessionId: string, fcmToken: string): Promise<void> {
    await this.chatSessionModel.updateOne({ sessionId }, { $set: { visitorFcmToken: fcmToken } });
  }

  async setStatus(
    sessionId: string,
    status: 'AI' | 'HANDOVER_REQUESTED' | 'LIVE' | 'ADMIN_BUSY',
    extras: {
      handoverRequestedAt?: Date | null;
      handoverTimeoutAt?: Date | null;
      assignedAdmin?: AssignedAdminPayload | null;
    } = {},
  ): Promise<void> {
    await this.chatSessionModel.updateOne(
      { sessionId },
      {
        $set: {
          status,
          handoverRequestedAt: extras.handoverRequestedAt ?? null,
          handoverTimeoutAt: extras.handoverTimeoutAt ?? null,
          assignedAdminId: extras.assignedAdmin?.adminId ?? '',
          assignedAdminEmail: extras.assignedAdmin?.adminEmail ?? '',
          assignedAdminSocketId: extras.assignedAdmin?.adminSocketId ?? '',
        },
      },
    );
  }

  async assignAdminSocket(adminId: string, socketId: string) {
    await this.chatSessionModel.updateMany(
      { assignedAdminId: adminId, status: 'LIVE' },
      { $set: { assignedAdminSocketId: socketId } },
    );
  }

  async listActiveLiveSessionsForAdmin(adminId: string): Promise<ChatSessionDocument[]> {
    return await this.chatSessionModel.find({ assignedAdminId: adminId, status: 'LIVE' });
  }

  async listAdminLeads(): Promise<AdminLeadSummary[]> {
    const sessions = await this.chatSessionModel.find().sort({ updatedAt: -1 }).limit(50);
    return sessions.map((session) => this.toAdminLeadSummary(session));
  }

  toAdminLeadSummary(session: ChatSessionDocument): AdminLeadSummary {
    return {
      sessionId: session.sessionId,
      status: session.status,
      visitorName: session.visitorName,
      visitorEmail: session.visitorEmail,
      visitorVerified: session.visitorVerified,
      assignedAdminId: session.assignedAdminId,
      assignedAdminEmail: session.assignedAdminEmail,
      latestMessage: session.messages.at(-1)?.content ?? '',
      messages: this.serializeMessages(session.messages),
      handoverRequestedAt: session.handoverRequestedAt?.toISOString() ?? null,
      handoverTimeoutAt: session.handoverTimeoutAt?.toISOString() ?? null,
    };
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
      deviceId: deviceInfo?.deviceId ?? '',
      userAgent: deviceInfo?.userAgent ?? '',
      language: deviceInfo?.language ?? '',
      platform: deviceInfo?.platform ?? '',
      screen: deviceInfo?.screen ?? '',
      timezone: deviceInfo?.timezone ?? '',
    };
  }
}
