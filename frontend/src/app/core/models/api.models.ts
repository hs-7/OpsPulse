export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp?: string;
  path?: string;
}

export interface AuthSession {
  accessToken: string;
  expiresIn?: number;
}

export interface Organization {
  id: string;
  name: string;
  role?: string;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  organizationId: string;
}

export interface WebhookEndpoint {
  id: string;
  projectId: string;
  endpointUrl: string;
  ingestionUrl?: string;
  secret?: string;
  active: boolean;
}

export interface Delivery {
  id: string;
  eventId: string;
  eventType: string;
  attemptCount: number;
  responseStatus: number | null;
  nextRetryAt: string | null;
  status: string;
}

export interface Incident {
  id: string;
  organizationId: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
}

export interface IncidentSummary {
  mode: 'gemini' | 'rule-based';
  organizationId?: string;
  summary: string;
}
