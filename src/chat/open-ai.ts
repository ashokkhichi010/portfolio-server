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
export class OpenAIService {
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = customConfig().OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateReply(messages: PersistedChatMessage[], latestUserMessage: string): Promise<AiReplyResult> {
    if (!this.client) {
      throw new UnauthorizedException("Model not found");
    }

    try {
      const completionMessages: ChatCompletionMessageParam[] = [{ role: 'system', content: getSystemPrompt() }];

      for (const message of messages.slice(-12)) {
        if (message.role === 'assistant') {
          completionMessages.push({ role: 'assistant', content: message.content });
        } else {
          completionMessages.push({ role: 'user', content: message.content });
        }
      }

      const response = await this.client.chat.completions.create({
        model: customConfig().OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
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
