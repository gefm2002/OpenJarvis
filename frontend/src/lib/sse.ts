import type { SSEEvent } from '../types';
import { getBase } from './api';

export interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: true;
  temperature?: number;
  max_tokens?: number;
}

function formatChatFetchError(err: unknown): Error {
  if (err instanceof TypeError && String(err.message).toLowerCase().includes('fetch')) {
    const hint =
      import.meta.env.DEV
        ? ' Comprueba que `jarvis serve` esté en marcha. En desarrollo deja la URL de API vacía en Ajustes para usar el proxy de Vite (evita CORS entre localhost y 127.0.0.1).'
        : ' Comprueba que el servidor OpenJarvis esté en marcha y la URL de API en Ajustes.';
    return new Error(`No se pudo conectar con el backend.${hint}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const base = getBase();
  let response: Response;
  try {
    response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (e) {
    throw formatChatFetchError(e);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.clone().text()).slice(0, 240);
    } catch {
      /* ignore */
    }
    throw new Error(
      `Chat request failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
    );
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent: string | undefined;

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          yield { event: currentEvent, data };
          currentEvent = undefined;
        } else if (line.trim() === '') {
          currentEvent = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
