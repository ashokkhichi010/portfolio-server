import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ChatSession,
  chatSessionCollection,
  chatSessionSchema,
} from './entities/chat-session.entity';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: chatSessionSchema, collection: chatSessionCollection },
    ]),
  ],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
