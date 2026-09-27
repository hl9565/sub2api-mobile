import { adminConfigState } from '@/src/store/admin-config';
import type { ApiEnvelope } from '@/src/types/admin';

function buildRequestUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.trim().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const duplicatedPrefixes = ['/api/v1', '/api'];

  for (const prefix of duplicatedPrefixes) {
    if (normalizedBase.endsWith(prefix) && normalizedPath.startsWith(`${prefix}/`)) {
      const baseWithoutPrefix = normalizedBase.slice(0, -prefix.length);
      return `${baseWithoutPrefix}${normalizedPath}`;
    }
  }

  return `${normalizedBase}${normalizedPath}`;
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  options?: { idempotencyKey?: string }
): Promise<T> {
  const baseUrl = adminConfigState.baseUrl.trim().replace(/\/$/, '');
  const adminApiKey = adminConfigState.adminApiKey.trim();

  if (!baseUrl) {
    throw new Error('BASE_URL_REQUIRED');
  }

  if (!adminApiKey) {
    throw new Error('ADMIN_API_KEY_REQUIRED');
  }

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (adminApiKey) {
    headers.set('x-api-key', adminApiKey);
  }

  if (options?.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  const response = await fetch(buildRequestUrl(baseUrl, path), {
    ...init,
    headers,
  });

  const rawText = await response.text();
  let json: any;

  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error('INVALID_SERVER_RESPONSE');
  }

  if (!response.ok) {
    throw new Error(json?.reason || json?.message || json?.error || `REQUEST_FAILED_${response.status}`);
  }

  // Handle envelope responses: { code: 0 | 200, data: ... }
  if (json && typeof json === 'object') {
    if (typeof json.code === 'number') {
      if (json.code !== 0 && json.code !== 200) {
        throw new Error(json.reason || json.message || 'REQUEST_FAILED');
      }
      if ('data' in json) {
        return json.data as T;
      }
    }
  }

  // Raw JSON response without envelope
  return json as T;
}
