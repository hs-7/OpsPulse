import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IncidentSummaryInput = {
  organizationId?: string;
  title?: string;
  severity?: string;
  status?: string;
  deliveryFailures?: number;
  responseStatus?: number | null;
};

@Injectable()
export class AIInsightsService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async summarize(input: IncidentSummaryInput) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      try {
        const prompt = `Analyze this incident and return a concise root-cause summary with likely cause and recommended next actions. Incident: ${JSON.stringify(input)}.`;
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: AbortSignal.timeout(15000),
          },
        );
        if (response.ok) {
          const result = await response.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const summary = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (summary) return { mode: 'gemini', organizationId: input.organizationId, summary };
        }
      } catch {
        // Deterministic fallback remains available if Gemini is unavailable.
      }
    }

    const title = input.title || 'Untitled incident';
    const severity = input.severity || 'unknown';
    const failures = input.deliveryFailures ?? 0;
    const status = input.status || 'open';
    const http = input.responseStatus ? ` The latest observed HTTP status was ${input.responseStatus}.` : '';
    return {
      mode: 'rule-based',
      organizationId: input.organizationId,
      summary: `Root-cause hypothesis: ${title} is ${severity} severity and currently ${status}. Repeated delivery failures (${failures}) suggest a destination availability or validation issue.${http} Check endpoint reachability, response status, signature configuration, retries, and recent payload changes.`,
    };
  }
}
