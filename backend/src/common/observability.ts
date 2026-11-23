import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

export class StructuredLogger {
  log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void {
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    console.log(JSON.stringify({
      level,
      message,
      traceId,
      timestamp: new Date().toISOString(),
      ...fields,
    }));
  }
}

let sdk: NodeSDK | undefined;

export function startObservability(): NodeSDK | undefined {
  if (!process.env.OTEL_SDK_DISABLED && !sdk) {
    sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      }),
    });
    sdk.start();
  }
  return sdk;
}

export async function stopObservability(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}
