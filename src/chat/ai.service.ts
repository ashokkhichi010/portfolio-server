import { Injectable } from '@nestjs/common';
import { PersistedChatMessage } from './chat.service';
import { OpenAIService } from './open-ai';
import { GroqAiService } from './groq-ai';
import { GenerativeAiService } from './generative-ai';
import { OpenRouterAiService } from './open-router-ai';

interface AiReplyResult {
  content: string;
  offerHandover: boolean;
}

@Injectable()
export class AiService {
  constructor(
    private readonly openAIService: OpenAIService,
    private readonly groqAiService: GroqAiService,
    private readonly generativeAiService: GenerativeAiService,
    private readonly openRouterAiService: OpenRouterAiService,
  ) { }

  async generateReply(messages: PersistedChatMessage[], latestUserMessage: string): Promise<AiReplyResult> {
    // try {
    // return await this.openAIService.generateReply(messages, latestUserMessage);
    // } catch (error) {
    // try {
    // return await this.groqAiService.generateReply(messages, latestUserMessage);
    // } catch (error) {
    // try {
    //   return await this.generativeAiService.generateReply(messages, latestUserMessage);
    // } catch (error) {
    try {
      return await this.openRouterAiService.generateReply(messages, latestUserMessage);
    } catch (error) {
      return this.fallbackReply(latestUserMessage);
    }
    // }
    // }
    // }
  }

  private fallbackReply(input: string): AiReplyResult {
    const offerHandover = this.detectHandoverIntent(input);

    return {
      content: offerHandover
        ? 'That sounds like a hiring or project conversation. I can share details here, and I can also help you connect with the admin.'
        : 'I can help with Ashok Kumar’s projects, backend/frontend stack, realtime systems, and collaboration details. Ask me anything specific.',
      offerHandover,
    };
  }

  private detectHandoverIntent(input: string): boolean {
    const normalized = input.toLowerCase();
    return ['hire', 'hiring', 'contact', 'call', 'talk to admin', 'speak to admin', 'project', 'price', 'pricing', 'availability'].some(
      (keyword) => normalized.includes(keyword),
    );
  }
}
