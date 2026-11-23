import { Module } from '@nestjs/common';
import { AIInsightsController } from './ai-insights.controller';
import { AIInsightsService } from './ai-insights.service';
@Module({ controllers: [AIInsightsController], providers: [AIInsightsService], exports: [AIInsightsService] })
export class AIInsightsModule {}
