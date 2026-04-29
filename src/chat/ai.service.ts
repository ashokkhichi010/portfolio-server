import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { customConfig } from 'src/config/config';
import { PersistedChatMessage } from './chat.service';

interface AiReplyResult {
  content: string;
  offerHandover: boolean;
}

@Injectable()
export class AiService {
  private readonly client: OpenAI | null;
  private readonly systemPrompt = `
You are Ashok Kumar's portfolio assistant. Answer briefly, clearly, and professionally.
Focus on work, projects, tech stack, availability, and collaboration.
If the visitor expresses hiring, contacting, discussing a project, pricing, availability, or wanting to speak with a person,
set offer_handover to true. Otherwise set it to false.
Always respond with strict JSON: {"reply":"string","offer_handover":boolean}
`;

  constructor() {
    const apiKey = customConfig().OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateReply(messages: PersistedChatMessage[], latestUserMessage: string): Promise<AiReplyResult> {
    if (!this.client) {
      return this.fallbackReply(latestUserMessage);
    }

    try {
      const completionMessages: ChatCompletionMessageParam[] = [{ role: 'system', content: this.systemPrompt }];

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
        return this.fallbackReply(latestUserMessage);
      }

      const parsed = JSON.parse(rawContent) as { reply?: string; offer_handover?: boolean };
      return {
        content: parsed.reply?.trim() || 'I can help with my work, stack, and availability. What would you like to know?',
        offerHandover: Boolean(parsed.offer_handover),
      };
    } catch(error) {
      return this.fallbackReply(latestUserMessage);
    }
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
