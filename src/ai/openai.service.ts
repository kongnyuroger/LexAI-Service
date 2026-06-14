import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

// Model and temperature are constants here so prompt-tuning stays in one place.
// TODO: consider gpt-4o for faster + cheaper responses once prompt is stable.
export const OPENAI_MODEL = 'gpt-4';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    temperature = 0.1,
  ): Promise<string> {
    this.logger.debug(`Calling ${OPENAI_MODEL} with ${messages.length} messages`);
    const response = await this.client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature,
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
