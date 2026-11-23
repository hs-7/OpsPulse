import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AIInsightsService {
  constructor(private readonly config: ConfigService) {}

  summarize(input: { organizationId?: string; title?: string; severity?: string }) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      return { mode: 'configured', organizationId: input.organizationId, summary: 'Gemini integration is configured.' };
    }
    const title = input.title || 'Untitled incident';
    const severity = input.severity || 'unknown';
    return {
      mode: 'rule-based',
      organizationId: input.organizationId,
      summary: `Rule-based summary: ${title} is classified as ${severity} severity. Review affected services and recent webhook deliveries.`,
    };
  }
}
