const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { OpenAIService, OPENAI_MODEL } from './openai.service';

describe('OpenAIService', () => {
  let service: OpenAIService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenAIService],
    }).compile();

    service = module.get<OpenAIService>(OpenAIService);
    jest.clearAllMocks();
  });

  describe('chat', () => {
    it('returns the content from the first choice', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello, legal world!' } }],
      });

      const result = await service.chat([{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('Hello, legal world!');
    });

    it('returns empty string when choices array is empty', async () => {
      mockChatCreate.mockResolvedValue({ choices: [] });

      const result = await service.chat([{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });

    it('returns empty string when message content is null', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await service.chat([{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });

    it('calls the API with the correct model and default temperature', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
      });

      const messages = [{ role: 'user' as const, content: 'test' }];
      await service.chat(messages);

      expect(mockChatCreate).toHaveBeenCalledWith({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.1,
      });
    });

    it('passes a custom temperature to the API', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
      });

      await service.chat([{ role: 'user', content: 'test' }], 0.3);

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.3 }),
      );
    });

    it('propagates API errors', async () => {
      mockChatCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(
        service.chat([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('Rate limit exceeded');
    });
  });
});
