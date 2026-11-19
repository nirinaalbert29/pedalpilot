import { Module } from '@nestjs/common';
import { LlmService } from '../ai/llm.service.js';
import { QualificationService } from '../qualification/qualification.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  controllers: [ChatController],
  providers: [ChatService, QualificationService, LlmService],
})
export class ChatModule {}
