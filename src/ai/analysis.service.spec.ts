import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from './analysis.service';
import { OpenAIService } from './openai.service';

const validSummary = {
  purpose: 'Employment contract between Employer Co. and John Doe',
  mainParties: ['Employer Co.', 'John Doe'],
  importantDates: ['2024-01-01 (effective date)', '2024-12-31 (expiry)'],
  moneyInvolved: ['50,000 XAF/month salary'],
  responsibilities: ['Employer: pay salary monthly', 'Employee: perform assigned duties'],
};

const validRiskFlags = [
  {
    severity: 'HIGH' as const,
    clauseText: 'Employee may be terminated without notice at employer discretion.',
    explanation: 'Could result in sudden loss of income with no legal recourse.',
  },
  {
    severity: 'MEDIUM' as const,
    clauseText: 'All disputes shall be settled by arbitration in Yaoundé.',
    explanation: 'Restricts employee from pursuing court action.',
  },
];

const validResponseJson = JSON.stringify({
  summary: validSummary,
  riskFlags: validRiskFlags,
});

describe('AnalysisService', () => {
  let service: AnalysisService;
  let openai: jest.Mocked<OpenAIService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: OpenAIService,
          useValue: { chat: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
    openai = module.get(OpenAIService);
  });

  describe('analyzeText — happy path', () => {
    it('returns parsed analysis when GPT-4 returns valid JSON', async () => {
      openai.chat.mockResolvedValue(validResponseJson);

      const result = await service.analyzeText('This is a legal contract.');

      expect(result.summary.mainParties).toEqual(['Employer Co.', 'John Doe']);
      expect(result.summary.importantDates).toHaveLength(2);
      expect(result.riskFlags).toHaveLength(2);
      expect(result.riskFlags[0].severity).toBe('HIGH');
    });

    it('returns empty riskFlags array when document has no risks', async () => {
      openai.chat.mockResolvedValue(
        JSON.stringify({ summary: validSummary, riskFlags: [] }),
      );

      const result = await service.analyzeText('Low-risk contract text.');

      expect(result.riskFlags).toEqual([]);
    });

    it('passes the document text in the user message', async () => {
      openai.chat.mockResolvedValue(validResponseJson);

      await service.analyzeText('my specific legal document text');

      expect(openai.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('my specific legal document text'),
          }),
        ]),
      );
    });

    it('truncates very long documents before sending to OpenAI', async () => {
      openai.chat.mockResolvedValue(validResponseJson);

      const longText = 'a'.repeat(20_000);
      await service.analyzeText(longText);

      const userMessage = (openai.chat.mock.calls[0][0] as { role: string; content: string }[]).find(
        (m) => m.role === 'user',
      )!;
      // The user prompt should not contain the full 20k chars
      expect(userMessage.content.length).toBeLessThan(15_000);
      expect(userMessage.content).toContain('[Document truncated for analysis]');
    });
  });

  describe('analyzeText — code fence stripping', () => {
    it('strips ```json fences before parsing', async () => {
      openai.chat.mockResolvedValue('```json\n' + validResponseJson + '\n```');

      const result = await service.analyzeText('document text');
      expect(result.summary.purpose).toContain('Employment contract');
    });

    it('strips plain ``` fences before parsing', async () => {
      openai.chat.mockResolvedValue('```\n' + validResponseJson + '\n```');

      const result = await service.analyzeText('document text');
      expect(result.riskFlags).toHaveLength(2);
    });
  });

  describe('analyzeText — error handling', () => {
    it('throws when GPT-4 returns non-JSON text', async () => {
      openai.chat.mockResolvedValue(
        'I am sorry, I cannot analyze this document.',
      );

      await expect(service.analyzeText('some text')).rejects.toThrow(
        'invalid response',
      );
    });

    it('throws when response is missing the summary field', async () => {
      openai.chat.mockResolvedValue(
        JSON.stringify({ riskFlags: [] }),
      );

      await expect(service.analyzeText('some text')).rejects.toThrow(
        'incomplete response',
      );
    });

    it('throws when riskFlags is not an array', async () => {
      openai.chat.mockResolvedValue(
        JSON.stringify({ summary: validSummary, riskFlags: null }),
      );

      await expect(service.analyzeText('some text')).rejects.toThrow(
        'incomplete response',
      );
    });

    it('propagates OpenAI network errors', async () => {
      openai.chat.mockRejectedValue(new Error('Network error'));

      await expect(service.analyzeText('some text')).rejects.toThrow(
        'Network error',
      );
    });
  });
});
