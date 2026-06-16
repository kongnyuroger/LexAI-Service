import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../ai/openai.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';

const DOC_TEXT = 'This employment contract is between Employer Co. and John Doe, effective 1 January 2024.';

const mockPrisma = {
  $transaction: jest.fn(),
  document: {
    findFirst: jest.fn(),
  },
  chatMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

const mockOpenAI = {
  chat: jest.fn(),
};

const mockKb = {
  search: jest.fn().mockResolvedValue([]),
  formatContext: jest.fn().mockReturnValue(''),
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OpenAIService, useValue: mockOpenAI },
        { provide: KnowledgeBaseService, useValue: mockKb },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('throws NotFoundException when document does not exist', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage('doc-1', 'user-1', 'What is the notice period?'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when extractedText is null', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        extractedText: null,
      });

      await expect(
        service.sendMessage('doc-1', 'user-1', 'What is the notice period?'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('sends document text and history to OpenAI and returns the answer', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        extractedText: DOC_TEXT,
      });
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockOpenAI.chat.mockResolvedValue('The contract starts on 1 January 2024.');
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'msg-1' })
        .mockResolvedValueOnce({ id: 'msg-2' });
      mockPrisma.$transaction.mockImplementation(
        (ops: Promise<unknown>[]) => Promise.all(ops),
      );

      const result = await service.sendMessage(
        'doc-1',
        'user-1',
        'When does the contract start?',
      );

      expect(mockOpenAI.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: expect.stringContaining(DOC_TEXT) }),
          expect.objectContaining({ role: 'user', content: 'When does the contract start?' }),
        ]),
        0.3,
      );
      expect(result).toEqual({ message: { id: 'msg-2', role: 'assistant' } });
    });

    it('includes prior conversation history in the OpenAI request', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        extractedText: DOC_TEXT,
      });
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { role: 'USER', content: 'Who are the parties?' },
        { role: 'ASSISTANT', content: 'Employer Co. and John Doe.' },
      ]);
      mockOpenAI.chat.mockResolvedValue('The salary is 50,000 XAF.');
      mockPrisma.chatMessage.create.mockResolvedValue({ id: 'msg-x' });
      mockPrisma.$transaction.mockImplementation(
        (ops: Promise<unknown>[]) => Promise.all(ops),
      );

      await service.sendMessage('doc-1', 'user-1', 'What is the salary?');

      const messages = mockOpenAI.chat.mock.calls[0][0] as { role: string; content: string }[];
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Who are the parties?' }),
          expect.objectContaining({ role: 'assistant', content: 'Employer Co. and John Doe.' }),
          expect.objectContaining({ role: 'user', content: 'What is the salary?' }),
        ]),
      );
    });

    it('persists both the user question and the assistant answer', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        extractedText: DOC_TEXT,
      });
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockOpenAI.chat.mockResolvedValue('An answer.');
      mockPrisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
      mockPrisma.$transaction.mockImplementation(
        (ops: Promise<unknown>[]) => Promise.all(ops),
      );

      await service.sendMessage('doc-1', 'user-1', 'A question?');

      expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'USER', content: 'A question?' }),
        }),
      );
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'ASSISTANT', content: 'An answer.' }),
        }),
      );
    });
  });

  describe('getHistory', () => {
    it('throws NotFoundException when document does not exist', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.getHistory('doc-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns an empty array when no messages exist', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1' });
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);

      const result = await service.getHistory('doc-1', 'user-1');
      expect(result).toEqual([]);
    });

    it('returns messages ordered oldest-first', async () => {
      const messages = [
        { id: 'msg-1', role: 'USER', content: 'First question', createdAt: new Date('2024-01-01') },
        { id: 'msg-2', role: 'ASSISTANT', content: 'First answer', createdAt: new Date('2024-01-02') },
      ];
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1' });
      mockPrisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.getHistory('doc-1', 'user-1');

      expect(result).toEqual([
        { id: 'msg-1', role: 'user', content: 'First question', createdAt: new Date('2024-01-01') },
        { id: 'msg-2', role: 'assistant', content: 'First answer', createdAt: new Date('2024-01-02') },
      ]);
      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
      );
    });
  });
});
