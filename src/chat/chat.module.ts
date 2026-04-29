import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ChatSession,
  chatSessionCollection,
  chatSessionSchema,
} from './entities/chat-session.entity';
import { AiService } from './ai.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FirebaseAuthService } from './firebase-auth.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: chatSessionSchema, collection: chatSessionCollection },
    ]),
  ],
  providers: [ChatGateway, ChatService, AiService, FirebaseAuthService],
  exports: [ChatService],
})
export class ChatModule {}
