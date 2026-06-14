import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AiModule } from '../ai/ai.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Module({
  imports: [AiModule, KnowledgeBaseModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
