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
import { ChatService, ChatDeviceInfoPayload } from './chat.service';
import { AiService } from './ai.service';
import { randomUUID } from 'crypto';
import { customConfig } from 'src/config/config';
import { FirebaseAuthService } from './firebase-auth.service';

interface ChatHandshakeAuth {
  sessionId?: string;
  deviceInfo?: ChatDeviceInfoPayload;
  role?: 'visitor' | 'admin';
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

  constructor(
    private readonly chatService: ChatService,
    private readonly aiService: AiService,
    private readonly firebaseAuthService: FirebaseAuthService,
  ) { }

  @WebSocketServer()
  server: Server;

  async handleConnection(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
    if (auth.role === 'admin') {
      socket.join(this.adminRoom);
      socket.emit('admin:queue.snapshot', await this.chatService.listAdminLeads());
      return;
    }

    const { session, isRestored } = await this.chatService.createOrRestoreSession(
      auth.sessionId,
      socket.id,
      auth.deviceInfo,
    );

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
    });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
    if (auth.role === 'admin') {
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

      this.startHandoverTimeout(session.sessionId);
    } catch (error) {
      socket.emit('chat:error', {
        code: 'INVALID_FIREBASE_TOKEN',
        message: error instanceof Error ? error.message : 'Firebase token verification failed.',
      });
    }
  }

  @SubscribeMessage('admin:handover.accept')
  async handleAdminAccept(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { sessionId?: string },
  ): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
    if (auth.role !== 'admin') {
      socket.emit('chat:error', { code: 'UNAUTHORIZED_ADMIN_ACTION' });
      return;
    }

    const sessionId = payload?.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    this.clearHandoverTimeout(sessionId);
    await this.chatService.setStatus(sessionId, 'LIVE');
    const session = await this.chatService.getSessionById(sessionId);
    if (!session) {
      return;
    }

    this.server.to(session.socketId).emit('handover:accepted', { sessionId, status: 'LIVE' });
    this.server.to(this.adminRoom).emit('admin:lead.updated', this.chatService.toAdminLeadSummary(session));
  }

  private startHandoverTimeout(sessionId: string): void {
    this.clearHandoverTimeout(sessionId);

    const timeout = setTimeout(async () => {
      await this.chatService.setStatus(sessionId, 'ADMIN_BUSY');
      const session = await this.chatService.getSessionById(sessionId);
      if (!session) {
        return;
      }

      this.server.to(session.socketId).emit('ADMIN_BUSY', { sessionId, status: 'ADMIN_BUSY' });
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
}
