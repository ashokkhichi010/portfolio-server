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

interface ChatHandshakeAuth {
  sessionId?: string;
  deviceInfo?: ChatDeviceInfoPayload;
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
  constructor(
    private readonly chatService: ChatService,
    private readonly aiService: AiService,
  ) { }

  @WebSocketServer()
  server: Server;

  async handleConnection(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as ChatHandshakeAuth;
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
    });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
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
}
