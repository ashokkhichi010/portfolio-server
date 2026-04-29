import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { DeviceService } from 'src/devices/device.service';
import { ChatService, ChatDeviceInfoPayload } from './chat.service';
import { AiService } from './ai.service';
import { randomUUID } from 'crypto';
import { customConfig } from 'src/config/config';
import { FcmService } from './fcm.service';
import { ChatSessionDocument } from './entities/chat-session.entity';
import { FirebaseAuthService } from './firebase-auth.service';

interface ChatHandshakeAuth {
  sessionId?: string;
  deviceInfo?: ChatDeviceInfoPayload;
  role?: 'visitor' | 'admin';
  token?: string;
  fcmToken?: string;
}

@WebSocketGateway({
  // namespace: '/chat',
  cors: {
    origin: customConfig().APP_URL || true,
    credentials: false,
  },
  transports: ['websocket'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly handoverTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly adminRoom = 'chat:admins';
  private readonly handoverTimeoutMs = Number(customConfig().HANDOVER_TIMEOUT_MS || 60000);
  private readonly adminSockets = new Map<string, string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly aiService: AiService,
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly authService: AuthService,
    private readonly fcmService: FcmService,
    private readonly deviceService: DeviceService,
  ) { }

  @WebSocketServer()
  server: Server;

  async handleConnection(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
    if (auth.role === 'admin') {
      const token = auth.token?.trim();
      if (!token) {
        socket.disconnect();
        return;
      }

      try {
        const admin = await this.authService.validateAdminAccessToken(token);
        socket.data.admin = admin;
        this.adminSockets.set(admin.id, socket.id);
        await this.chatService.assignAdminSocket(admin.id, socket.id);
        await this.deviceService.registerDevice('admin', admin.id, {
          deviceId: auth.deviceInfo?.deviceId ?? socket.id,
          fcmToken: auth.fcmToken ?? '',
          platform: auth.deviceInfo?.platform ?? '',
          userAgent: auth.deviceInfo?.userAgent ?? '',
          language: auth.deviceInfo?.language ?? '',
          screen: auth.deviceInfo?.screen ?? '',
          timezone: auth.deviceInfo?.timezone ?? '',
        });
        socket.join(this.adminRoom);
        socket.emit('admin:queue.snapshot', await this.chatService.listAdminLeads());
      } catch {
        socket.emit('chat:error', { code: 'INVALID_ADMIN_TOKEN' });
        socket.disconnect();
      }
      return;
    }

    const { session, isRestored } = await this.chatService.createOrRestoreSession(
      auth.sessionId,
      socket.id,
      auth.deviceInfo,
    );

    await this.deviceService.registerDevice('visitor', session.sessionId, {
      deviceId: auth.deviceInfo?.deviceId ?? socket.id,
      fcmToken: auth.fcmToken ?? '',
      platform: auth.deviceInfo?.platform ?? '',
      userAgent: auth.deviceInfo?.userAgent ?? '',
      language: auth.deviceInfo?.language ?? '',
      screen: auth.deviceInfo?.screen ?? '',
      timezone: auth.deviceInfo?.timezone ?? '',
    });

    socket.emit('chat:session.ready', {
      sessionId: session.sessionId,
      socketId: socket.id,
      isRestored,
      connectedAt: session.connectedAt.toISOString(),
      messages: this.chatService.serializeMessages(session.messages),
      handoverOffered: session.handoverOffered,
      handoverStatus: session.status,
      handoverRequestedAt: session.handoverRequestedAt?.toISOString() ?? null,
      handoverExpiresAt: session.handoverTimeoutAt?.toISOString() ?? null,
      visitorVerified: session.visitorVerified,
      visitorEmail: session.visitorEmail,
      visitorName: session.visitorName,
    });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
    if (auth.role === 'admin') {
      const admin = socket.data.admin as { id: string } | undefined;
      if (admin) {
        this.adminSockets.delete(admin.id);
      }
      return;
    }

    await this.chatService.disconnectSession(socket.id);
  }

  @SubscribeMessage('chat:message.send')
  async handleMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { content?: string },
  ): Promise<void> {
    const content = payload?.content?.trim();
    if (!content) {
      return;
    }

    const session = await this.chatService.getSessionBySocketId(socket.id);
    if (!session) {
      return;
    }

    const visitorMessage = await this.chatService.appendMessage(session.sessionId, {
      id: randomUUID(),
      role: 'visitor',
      content,
    });

    socket.emit('chat:message.created', visitorMessage);

    if (session.status === 'LIVE' && session.assignedAdminSocketId) {
      this.server.to(session.assignedAdminSocketId).emit('chat:message.created', visitorMessage);
      return;
    }

    try {
      const aiReply = await this.aiService.generateReply(
        [...this.chatService.serializeMessages(session.messages), visitorMessage],
        content,
      );

      const assistantMessage = await this.chatService.appendMessage(session.sessionId, {
        id: randomUUID(),
        role: 'assistant',
        content: aiReply.content,
      });

      socket.emit('chat:message.created', assistantMessage);

      if (aiReply.offerHandover && !session.handoverOffered) {
        await this.chatService.setHandoverOffered(session.sessionId, true);
        socket.emit('AI_OFFER_HANDOVER', {
          sessionId: session.sessionId,
          reason: 'hire_or_contact_intent',
        });
      }
    } catch {
      await this.promoteToAutomaticHandover(session, socket, 'ai_failure');
    }
  }

  @SubscribeMessage('request_handover')
  async handleHandoverRequest(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { firebaseToken?: string },
  ): Promise<void> {
    const firebaseToken = payload?.firebaseToken?.trim();
    if (!firebaseToken) {
      socket.emit('chat:error', { code: 'MISSING_FIREBASE_TOKEN' });
      return;
    }

    const session = await this.chatService.getSessionBySocketId(socket.id);
    if (!session) {
      socket.emit('chat:error', { code: 'SESSION_NOT_FOUND' });
      return;
    }

    try {
      const visitor = await this.firebaseAuthService.verifyVisitorToken(firebaseToken);
      await this.chatService.verifyVisitor(session.sessionId, visitor);
      await this.deviceService.registerDevice('visitor', session.sessionId, {
        deviceId: session.deviceInfo.deviceId || socket.id,
        fcmToken: authFcmToken(socket),
        platform: session.deviceInfo.platform,
        userAgent: session.deviceInfo.userAgent,
        language: session.deviceInfo.language,
        screen: session.deviceInfo.screen,
        timezone: session.deviceInfo.timezone,
      });

      const requestedAt = new Date();
      const timeoutAt = new Date(requestedAt.getTime() + this.handoverTimeoutMs);
      await this.chatService.setStatus(session.sessionId, 'HANDOVER_REQUESTED', {
        handoverRequestedAt: requestedAt,
        handoverTimeoutAt: timeoutAt,
      });

      socket.emit('handover:requested', {
        sessionId: session.sessionId,
        status: 'HANDOVER_REQUESTED',
        timeoutMs: this.handoverTimeoutMs,
        expiresAt: timeoutAt.toISOString(),
      });

      const refreshedSession = await this.chatService.getSessionById(session.sessionId);
      if (refreshedSession) {
        this.server.to(this.adminRoom).emit('admin:lead.updated', this.chatService.toAdminLeadSummary(refreshedSession));
      }

      await this.fcmService.sendNewLeadAlert({
        sessionId: session.sessionId,
        visitorName: visitor.name,
        visitorEmail: visitor.email,
        status: 'HANDOVER_REQUESTED',
      });

      this.startHandoverTimeout(session.sessionId);
    } catch (error) {
      socket.emit('chat:error', {
        code: 'INVALID_FIREBASE_TOKEN',
        message: error instanceof Error ? error.message : 'Firebase token verification failed.',
      });
    }
  }

  @SubscribeMessage('admin:handover.accept')
  @SubscribeMessage('admin_join_chat')
  async handleAdminAccept(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { sessionId?: string },
  ): Promise<void> {
    const admin = socket.data.admin as { id: string; email: string } | undefined;
    if (!admin) {
      socket.emit('chat:error', { code: 'UNAUTHORIZED_ADMIN_ACTION' });
      return;
    }

    const sessionId = payload?.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    this.clearHandoverTimeout(sessionId);
    await this.chatService.setStatus(sessionId, 'LIVE', {
      assignedAdmin: {
        adminId: admin.id,
        adminEmail: admin.email,
        adminSocketId: socket.id,
      },
    });
    const session = await this.chatService.getSessionById(sessionId);
    if (!session) {
      return;
    }

    this.server.to(session.socketId).emit('handover:accepted', { sessionId, status: 'LIVE' });
    socket.emit('admin:handover.accepted', {
      sessionId,
      status: 'LIVE',
      messages: this.chatService.serializeMessages(session.messages),
      visitorName: session.visitorName,
      visitorEmail: session.visitorEmail,
    });
    this.server.to(this.adminRoom).emit('admin:lead.updated', this.chatService.toAdminLeadSummary(session));
  }

  @SubscribeMessage('admin:message.send')
  async handleAdminMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { sessionId?: string; content?: string },
  ): Promise<void> {
    const admin = socket.data.admin as { id: string } | undefined;
    if (!admin) {
      socket.emit('chat:error', { code: 'UNAUTHORIZED_ADMIN_ACTION' });
      return;
    }

    const sessionId = payload?.sessionId?.trim();
    const content = payload?.content?.trim();
    if (!sessionId || !content) {
      return;
    }

    const session = await this.chatService.getSessionById(sessionId);
    if (!session || session.status !== 'LIVE' || session.assignedAdminId !== admin.id) {
      socket.emit('chat:error', { code: 'INVALID_LIVE_SESSION' });
      return;
    }

    const adminMessage = await this.chatService.appendMessage(sessionId, {
      id: randomUUID(),
      role: 'admin',
      content,
    });

    socket.emit('chat:message.created', adminMessage);
    this.server.to(session.socketId).emit('chat:message.created', adminMessage);
    if (session.visitorVerified) {
      await this.fcmService.sendVisitorMessageAlert({
        ownerId: session.sessionId,
        title: 'Admin replied',
        body: content,
        sessionId,
        status: session.status,
        type: 'admin_message',
      });
    }
    this.server.to(this.adminRoom).emit('admin:lead.updated', {
      ...this.chatService.toAdminLeadSummary(await this.chatService.getSessionById(sessionId) ?? session),
    });
  }

  private startHandoverTimeout(sessionId: string): void {
    this.clearHandoverTimeout(sessionId);

    const timeout = setTimeout(async () => {
      await this.chatService.setStatus(sessionId, 'ADMIN_BUSY');
      const session = await this.chatService.getSessionById(sessionId);
      if (!session) {
        return;
      }

      const fallbackMessage = await this.chatService.appendMessage(sessionId, {
        id: randomUUID(),
        role: 'assistant',
        content:
          'Admin is busy right now, so please leave your message, email, or contact number and we will reach back to you.',
      });

      this.server.to(session.socketId).emit('ADMIN_BUSY', { sessionId, status: 'ADMIN_BUSY' });
      this.server.to(session.socketId).emit('chat:message.created', fallbackMessage);
      this.server.to(this.adminRoom).emit('admin:lead.updated', this.chatService.toAdminLeadSummary(session));
      this.handoverTimeouts.delete(sessionId);
    }, this.handoverTimeoutMs);

    this.handoverTimeouts.set(sessionId, timeout);
  }

  private clearHandoverTimeout(sessionId: string): void {
    const timeout = this.handoverTimeouts.get(sessionId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.handoverTimeouts.delete(sessionId);
  }

  private async promoteToAutomaticHandover(
    session: ChatSessionDocument,
    socket: Socket,
    reason: 'ai_failure',
  ) {
    const requestedAt = new Date();
    const timeoutAt = new Date(requestedAt.getTime() + this.handoverTimeoutMs);
    await this.chatService.setHandoverOffered(session.sessionId, true);
    await this.chatService.setStatus(session.sessionId, 'HANDOVER_REQUESTED', {
      handoverRequestedAt: requestedAt,
      handoverTimeoutAt: timeoutAt,
    });

    const assistantMessage = await this.chatService.appendMessage(session.sessionId, {
      id: randomUUID(),
      role: 'assistant',
      content: 'I am connecting you to a human right away.',
    });

    socket.emit('chat:message.created', assistantMessage);
    socket.emit('handover:requested', {
      sessionId: session.sessionId,
      status: 'HANDOVER_REQUESTED',
      timeoutMs: this.handoverTimeoutMs,
      expiresAt: timeoutAt.toISOString(),
      autoTriggered: true,
      reason,
    });

    const refreshedSession = await this.chatService.getSessionById(session.sessionId);
    if (refreshedSession) {
      this.server.to(this.adminRoom).emit('admin:lead.updated', this.chatService.toAdminLeadSummary(refreshedSession));
      await this.fcmService.sendNewLeadAlert({
        sessionId: session.sessionId,
        visitorName: refreshedSession.visitorName,
        visitorEmail: refreshedSession.visitorEmail,
        status: 'HANDOVER_REQUESTED',
      });
    }

    this.startHandoverTimeout(session.sessionId);
  }
}

const authFcmToken = (socket: Socket) => {
  const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
  return auth.fcmToken ?? '';
};
