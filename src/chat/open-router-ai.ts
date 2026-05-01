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
export class OpenRouterAiService {
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = customConfig().OPEN_ROUTER_API_KEY; // Add to your .env
    this.client = apiKey ? new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1', // OpenRouter unified endpoint
      defaultHeaders: {
        'HTTP-Referer': customConfig().APP_URL || 'http://localhost:5173', // Optional
        'X-Title': 'Ashok Kumar Portfolio', // Optional
      },
    }) : null;
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

      // Add the latest user input
      completionMessages.push({ role: 'user', content: latestUserMessage });

      const response = await this.client.chat.completions.create({
        // Examples: 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', or 'meta-llama/llama-3.1-8b-instruct:free'
        model: customConfig().OPEN_ROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
        temperature: 0.4,
        response_format: { type: 'json_object' }, // OpenRouter supports JSON mode for compatible models
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
