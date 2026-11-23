import { Module } from '@nestjs/common';
import { AIInsightsController } from './ai-insights.controller';
import { AIInsightsService } from './ai-insights.service';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [ConfigModule],
  controllers: [AIInsightsController],
  providers: [AIInsightsService],
  exports: [AIInsightsService],
})
export class AIInsightsModule {}
