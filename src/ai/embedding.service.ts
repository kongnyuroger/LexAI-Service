import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
// Dimension must match the vector(1536) column in LegalSource schema.
export const EMBEDDING_DIMENSIONS = 1536;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async embed(text: string): Promise<number[]> {
    this.logger.debug(`Embedding ${text.length} chars with ${EMBEDDING_MODEL}`);
    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      // OpenAI recommends replacing newlines for better embedding quality
      input: text.replace(/\n/g, ' '),
    });
    return response.data[0].embedding;
  }

  // Formats a vector array into the '[0.1,0.2,...]' string pgvector expects.
  formatForPgvector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
