import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  id: string;
}

@ApiTags('chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class ChatController {
  constructor(private chat: ChatService) {}

  @Post(':id/chat')
  @ApiOperation({ summary: 'Ask a question about the document (RAG-powered Q&A)' })
  @ApiResponse({ status: 201, description: 'Returns the assistant answer.' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  @ApiResponse({ status: 422, description: 'Document text not yet extracted.' })
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMessageDto,
  ) {
    return this.chat.sendMessage(id, user.id, dto.message);
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Get the full conversation history for a document' })
  @ApiResponse({ status: 200, description: 'Returns messages ordered oldest-first.' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  getHistory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chat.getHistory(id, user.id);
  }
}
