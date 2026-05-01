import { Injectable, UnauthorizedException } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { customConfig } from 'src/config/config';
import { PersistedChatMessage } from './chat.service';
import { getSystemPrompt } from 'src/utils/system.prompt';

interface AiReplyResult {
  content: string;
  offerHandover: boolean;
}

@Injectable()
export class GroqAiService {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = new OpenAI({
      apiKey: customConfig().GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1', // Must include /v1
    });
  }

  async generateReply(messages: PersistedChatMessage[], latestUserMessage: string): Promise<AiReplyResult> {
    if (!this.client) {
      throw new UnauthorizedException("Model not found");
    }

    try {
      const completionMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: getSystemPrompt() }
      ];

      // Format conversation history
      for (const message of messages.slice(-12)) {
        completionMessages.push({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content
        });
      }

      // Add the latest message
      completionMessages.push({ role: 'user', content: latestUserMessage });

      const response = await this.client.chat.completions.create({
        // Recommended Groq models: 'llama-3.3-70b-versatile' or 'llama-3.1-8b-instant'
        model: customConfig().GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.4,
        stream: false,
        response_format: { type: 'json_object' }, // Groq supports JSON mode
        messages: completionMessages,
      });

      const rawContent = response.choices[0]?.message?.content;

      if (!rawContent) {
        throw new UnauthorizedException("Row Content not found");
      }

      const parsed = JSON.parse(rawContent) as { reply?: string; offer_handover?: boolean };

      return {
        content: parsed.reply?.trim() || 'I can help with my work, stack, and availability. What would you like to know?',
        offerHandover: Boolean(parsed.offer_handover),
      };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }
}
