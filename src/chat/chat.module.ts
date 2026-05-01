import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { DeviceModule } from 'src/devices/device.module';
import {
  ChatSession,
  chatSessionCollection,
  chatSessionSchema,
} from './entities/chat-session.entity';
import { AiService } from './ai.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FcmService } from './fcm.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { OpenAIService } from './open-ai';
import { GroqAiService } from './groq-ai';
import { GenerativeAiService } from './generative-ai';
import { OpenRouterAiService } from './open-router-ai';

@Module({
  imports: [
    AuthModule,
    DeviceModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: chatSessionSchema, collection: chatSessionCollection },
    ]),
  ],
  providers: [ChatGateway, ChatService, AiService, FirebaseAuthService, FcmService, OpenAIService, GroqAiService, GenerativeAiService, OpenRouterAiService],
  exports: [ChatService],
})
export class ChatModule {}
