import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AIInsightsService } from './ai-insights.service';
@ApiTags('ai-insights')
@Controller('ai-insights')
export class AIInsightsController {
  constructor(@Inject(AIInsightsService) private readonly service: AIInsightsService) {}
  @Post('summary') summary(@Body() body: { organizationId?: string; title?: string; severity?: string }) {
    return this.service.summarize(body);
  }
}
