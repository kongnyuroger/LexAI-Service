import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';

export interface KbSearchResult {
  id: string;
  title: string;
  jurisdiction: string;
  content: string;
  distance: number;
}

// Chunk size tuned for text-embedding-3-small's 8191-token limit.
// ~500 words ≈ 650 tokens — leaves plenty of room.
const CHUNK_TARGET_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 50;

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private prisma: PrismaService,
    private embedding: EmbeddingService,
  ) {}

  async ingest(
    title: string,
    jurisdiction: string,
    sourceType: string,
    content: string,
  ): Promise<{ chunksCreated: number }> {
    const chunks = this.chunkText(content);
    this.logger.log(`Ingesting "${title}" — ${chunks.length} chunks`);

    // Sequential to avoid hitting OpenAI embedding rate limits
    for (const chunkText of chunks) {
      const vec = await this.embedding.embed(`${title}: ${chunkText}`);
      const vectorStr = this.embedding.formatForPgvector(vec);

      const source = await this.prisma.legalSource.create({
        data: { id: randomUUID(), title, jurisdiction, sourceType, content: chunkText },
      });

      // Unsupported("vector(1536)") fields cannot be written via Prisma create/update.
      // Use a raw UPDATE to set the embedding column after the record is created.
      await this.prisma.$executeRawUnsafe(
        `UPDATE "LegalSource" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        source.id,
      );
    }

    return { chunksCreated: chunks.length };
  }

  async search(query: string, limit = 3): Promise<KbSearchResult[]> {
    try {
      const vec = await this.embedding.embed(query);
      const vectorStr = this.embedding.formatForPgvector(vec);

      const results = await this.prisma.$queryRawUnsafe<KbSearchResult[]>(
        `SELECT id, title, jurisdiction, content,
                (embedding <=> $1::vector) AS distance
         FROM "LegalSource"
         WHERE embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT $2`,
        vectorStr,
        limit,
      );

      return results;
    } catch (err) {
      // Degrade gracefully if KB is empty or pgvector query fails
      this.logger.warn(
        `Knowledge base search failed (degrading gracefully): ${(err as Error).message}`,
      );
      return [];
    }
  }

  // Format search results into a block suitable for inclusion in AI prompts.
  formatContext(results: KbSearchResult[]): string {
    if (results.length === 0) return '';

    return results
      .map((r) => `[${r.title} — ${r.jurisdiction}]\n${r.content}`)
      .join('\n\n---\n\n');
  }

  // Split text into overlapping word-count chunks at paragraph boundaries.
  chunkText(
    text: string,
    targetWords = CHUNK_TARGET_WORDS,
    overlapWords = CHUNK_OVERLAP_WORDS,
  ): string[] {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let buffer: string[] = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      buffer.push(...words);

      while (buffer.length >= targetWords) {
        chunks.push(buffer.slice(0, targetWords).join(' '));
        buffer = buffer.slice(targetWords - overlapWords);
      }
    }

    if (buffer.length > 0) {
      chunks.push(buffer.join(' '));
    }

    // Drop fragments too short to be useful for RAG
    return chunks.filter((c) => c.split(/\s+/).length >= 20);
  }
}
