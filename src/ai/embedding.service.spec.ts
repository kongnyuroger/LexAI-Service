// Mock the openai module before importing EmbeddingService so the
// constructor sees the stub instead of the real OpenAI SDK.
const mockEmbeddingsCreate = jest.fn();
// __esModule: true tells ts-jest's __importDefault to use the `default` key
// directly, rather than double-wrapping the object.
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    embeddings: { create: mockEmbeddingsCreate },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingService, EMBEDDING_DIMENSIONS } from './embedding.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmbeddingService],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
    jest.clearAllMocks();
  });

  describe('embed', () => {
    it('returns a vector of the correct dimension', async () => {
      const fakeEmbedding = Array(EMBEDDING_DIMENSIONS).fill(0.05);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: fakeEmbedding }],
      });

      const result = await service.embed('This is a legal clause.');

      expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(result[0]).toBe(0.05);
    });

    it('calls the OpenAI embeddings API with the correct model', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: Array(EMBEDDING_DIMENSIONS).fill(0) }],
      });

      await service.embed('test input');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'text-embedding-3-small' }),
      );
    });

    it('replaces newlines before sending to the API', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: Array(EMBEDDING_DIMENSIONS).fill(0) }],
      });

      await service.embed('line one\nline two\nline three');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'line one line two line three' }),
      );
    });
  });

  describe('formatForPgvector', () => {
    it('formats a numeric array as a pgvector-compatible string', () => {
      const result = service.formatForPgvector([0.1, 0.2, 0.3]);
      expect(result).toBe('[0.1,0.2,0.3]');
    });

    it('handles a full 1536-dimension vector', () => {
      const vec = Array(EMBEDDING_DIMENSIONS).fill(0.001);
      const result = service.formatForPgvector(vec);
      expect(result.startsWith('[')).toBe(true);
      expect(result.endsWith(']')).toBe(true);
      expect(result.split(',').length).toBe(EMBEDDING_DIMENSIONS);
    });
  });
});
