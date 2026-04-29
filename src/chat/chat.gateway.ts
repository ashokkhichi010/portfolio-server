import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService, ChatDeviceInfoPayload } from './chat.service';
import { customConfig } from 'src/config/config';

interface ChatHandshakeAuth {
  sessionId?: string;
  deviceInfo?: ChatDeviceInfoPayload;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: customConfig().APP_URL || true,
    credentials: false,
  },
  transports: ['websocket'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly chatService: ChatService) {}

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
    });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    await this.chatService.disconnectSession(socket.id);
  }
}
