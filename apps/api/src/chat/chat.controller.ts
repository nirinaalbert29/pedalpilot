import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import type { ChatRequest } from './chat.service.js';
import type { ChatResponse } from '../qualification/qualification.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Échange avec l’agent de qualification de la landing page. */
  @Post()
  send(@Body() body: ChatRequest): Promise<ChatResponse> {
    return this.chat.send(body ?? { message: '' });
  }
}
