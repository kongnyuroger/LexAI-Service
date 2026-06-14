import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';

const MOCK_EMBEDDING = Array(1536).fill(0.05);
const MOCK_VECTOR_STR = `[${MOCK_EMBEDDING.join(',')}]`;

const mockPrisma = {
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  legalSource: {
    create: jest.fn(),
  },
};

const mockEmbedding = {
  embed: jest.fn().mockResolvedValue(MOCK_EMBEDDING),
  formatForPgvector: jest.fn().mockReturnValue(MOCK_VECTOR_STR),
};

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmbeddingService, useValue: mockEmbedding },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    jest.clearAllMocks();
    mockEmbedding.embed.mockResolvedValue(MOCK_EMBEDDING);
    mockEmbedding.formatForPgvector.mockReturnValue(MOCK_VECTOR_STR);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  // ─── chunkText ────────────────────────────────────────────────────────────

  describe('chunkText', () => {
    it('returns the full text as one chunk when it is short', () => {
      const text = 'This is a short legal text. '.repeat(10);
      const chunks = service.chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('legal text');
    });

    it('splits long text into multiple chunks at roughly the target word count', () => {
      // 1500 words → expect ~3 chunks (1500/500)
      const text = Array(1500).fill('word').join(' ');
      const chunks = service.chunkText(text, 500, 50);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('overlaps consecutive chunks', () => {
      // Build exactly 600 distinct words, no paragraph breaks
      const words = Array.from({ length: 600 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = service.chunkText(text, 500, 50);
      // The end of chunk[0] and start of chunk[1] should share 50 words
      const endOf0 = chunks[0].split(' ').slice(-50);
      const startOf1 = chunks[1].split(' ').slice(0, 50);
      expect(endOf0).toEqual(startOf1);
    });

    it('drops fragments shorter than 20 words', () => {
      const text = 'Short.\n\nAlso short.\n\n' + 'word '.repeat(500);
      const chunks = service.chunkText(text);
      // "Short." and "Also short." are 1-word and 2-word fragments — filtered
      chunks.forEach((chunk) =>
        expect(chunk.split(/\s+/).length).toBeGreaterThanOrEqual(20),
      );
    });
  });

  // ─── ingest ───────────────────────────────────────────────────────────────

  describe('ingest', () => {
    it('creates one LegalSource record and sets its embedding per chunk', async () => {
      const content = 'Legal text. '.repeat(30); // ~30 words → single chunk
      mockPrisma.legalSource.create.mockResolvedValue({ id: 'src-1' });

      const result = await service.ingest(
        'Labour Code',
        'Cameroon',
        'statute',
        content,
      );

      expect(result.chunksCreated).toBe(1);
      expect(mockEmbedding.embed).toHaveBeenCalledTimes(1);
      expect(mockPrisma.legalSource.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "LegalSource"'),
        MOCK_VECTOR_STR,
        'src-1',
      );
    });

    it('creates multiple records for long content', async () => {
      const content = 'word '.repeat(1100); // > 500 words → 2+ chunks
      mockPrisma.legalSource.create.mockResolvedValue({ id: 'src-x' });

      const result = await service.ingest('Title', 'Cameroon', 'statute', content);

      expect(result.chunksCreated).toBeGreaterThanOrEqual(2);
      expect(mockPrisma.legalSource.create).toHaveBeenCalledTimes(result.chunksCreated);
    });

    it('prefixes the title to the text before embedding', async () => {
      const content = 'word '.repeat(30);
      mockPrisma.legalSource.create.mockResolvedValue({ id: 'src-1' });

      await service.ingest('Labour Code', 'Cameroon', 'statute', content);

      expect(mockEmbedding.embed).toHaveBeenCalledWith(
        expect.stringContaining('Labour Code:'),
      );
    });
  });

  // ─── search ───────────────────────────────────────────────────────────────

  describe('search', () => {
    it('embeds the query and calls $queryRawUnsafe with the vector', async () => {
      await service.search('What is the notice period?');

      expect(mockEmbedding.embed).toHaveBeenCalledWith('What is the notice period?');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('embedding <=>'),
        MOCK_VECTOR_STR,
        3, // default limit
      );
    });

    it('respects a custom limit', async () => {
      await service.search('query', 5);

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.any(String),
        MOCK_VECTOR_STR,
        5,
      );
    });

    it('returns empty array when $queryRawUnsafe throws', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error('pgvector error'));

      const result = await service.search('query');

      expect(result).toEqual([]);
    });

    it('returns the search results from the DB', async () => {
      const mockResults = [
        { id: 'src-1', title: 'Labour Code', jurisdiction: 'Cameroon', content: 'Article 1...', distance: 0.12 },
      ];
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce(mockResults);

      const result = await service.search('notice period');

      expect(result).toEqual(mockResults);
    });
  });

  // ─── formatContext ────────────────────────────────────────────────────────

  describe('formatContext', () => {
    it('returns empty string for empty results', () => {
      expect(service.formatContext([])).toBe('');
    });

    it('formats a single result with title and jurisdiction', () => {
      const results = [
        { id: 'src-1', title: 'Labour Code', jurisdiction: 'Cameroon', content: 'Article 1 text.', distance: 0.1 },
      ];
      const ctx = service.formatContext(results);
      expect(ctx).toContain('[Labour Code — Cameroon]');
      expect(ctx).toContain('Article 1 text.');
    });

    it('separates multiple results with a divider', () => {
      const results = [
        { id: 's1', title: 'A', jurisdiction: 'Cm', content: 'Content A', distance: 0.1 },
        { id: 's2', title: 'B', jurisdiction: 'Cm', content: 'Content B', distance: 0.2 },
      ];
      const ctx = service.formatContext(results);
      expect(ctx).toContain('---');
      expect(ctx).toContain('Content A');
      expect(ctx).toContain('Content B');
    });
  });
});
