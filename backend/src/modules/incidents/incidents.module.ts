import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { AuthModule } from '../auth/auth.module';
import { AIInsightsModule } from '../ai-insights/ai-insights.module';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({
  imports: [AuthModule, AIInsightsModule, NotificationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
