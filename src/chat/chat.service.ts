import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../ai/openai.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { buildChatSystemPrompt } from './prompts/chat.prompt';

// Keep the last N messages in context to bound token usage per request.
const HISTORY_LIMIT = 10;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIService,
    private kb: KnowledgeBaseService,
  ) {}

  async sendMessage(documentId: string, userId: string, message: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (!doc.extractedText) {
      throw new UnprocessableEntityException(
        'Document text has not been extracted yet. Please try again shortly.',
      );
    }

    const history = await this.prisma.chatMessage.findMany({
      where: { documentId, userId },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });

    const kbResults = await this.kb.search(message);
    const legalContext = this.kb.formatContext(kbResults);

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildChatSystemPrompt(doc.extractedText, legalContext || undefined) },
      ...history.map((msg) => ({
        role: msg.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    const answer = await this.openai.chat(openaiMessages, 0.3);

    // Persist user message and assistant answer atomically; capture assistant record for response
    const [, assistantMsg] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { documentId, userId, role: 'USER', content: message },
      }),
      this.prisma.chatMessage.create({
        data: { documentId, userId, role: 'ASSISTANT', content: answer },
        select: { id: true, role: true, content: true, createdAt: true },
      }),
    ]);

    return {
      message: { ...assistantMsg, role: 'assistant' as const },
    };
  }

  async getHistory(documentId: string, userId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true },
    });

    if (!doc) throw new NotFoundException('Document not found');

    const messages = await this.prisma.chatMessage.findMany({
      where: { documentId, userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return messages.map((msg) => ({
      ...msg,
      role: msg.role.toLowerCase() as 'user' | 'assistant',
    }));
  }
}
