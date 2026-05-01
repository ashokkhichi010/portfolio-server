import { Injectable, UnauthorizedException } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel, SchemaType } from '@google/generative-ai';
import { customConfig } from 'src/config/config';
import { PersistedChatMessage } from './chat.service';
import { getSystemPrompt } from 'src/utils/system.prompt';

interface AiReplyResult {
  content: string;
  offerHandover: boolean;
}

@Injectable()
export class GenerativeAiService {
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly model: GenerativeModel | null;

  constructor() {
    const apiKey = customConfig().GOOGLE_AI_API_KEY; // Ensure this is in your config
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: customConfig().GOOGLE_MODEL || 'gemini-1.5-flash',
        systemInstruction: getSystemPrompt(),
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              reply: { type: SchemaType.STRING },
              offer_handover: { type: SchemaType.BOOLEAN }
            },
            required: ["reply", "offer_handover"]
          },
          temperature: 0.4,
        },
      });
    } else {
      this.genAI = null;
      this.model = null;
    }
  }

  async generateReply(messages: PersistedChatMessage[], latestUserMessage: string): Promise<AiReplyResult> {
    if (!this.model) {
      throw new UnauthorizedException("Model not found");
    }

    try {
      // Format history: Gemini uses 'user' and 'model' roles
      const history = messages.slice(-12).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const chatSession = this.model.startChat({ history });
      const result = await chatSession.sendMessage(latestUserMessage);
      const rawContent = result.response.text();

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
