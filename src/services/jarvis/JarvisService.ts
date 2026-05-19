/**
 * Jarvis Service — Orchestrates the interaction with the local Jarvis assistant.
 */

import { toApiUrl } from '@/services/runtime';
import { mlWorker } from '@/services/ml-worker';

export interface JarvisResponse {
  text: string;
  timestamp: number;
  mode: string;
  status: string;
}

export class JarvisService {
  private static instance: JarvisService;
  private isThinking = false;

  private constructor() {}

  public static getInstance(): JarvisService {
    if (!JarvisService.instance) {
      JarvisService.instance = new JarvisService();
    }
    return JarvisService.instance;
  }

  /**
   * Send a text query to the Jarvis assistant.
   */
  public async sendQuery(query: string): Promise<JarvisResponse> {
    this.isThinking = true;
    try {
      // Search memory for context
      const memoryContext = await this.searchMemory(query);
      
      const response = await fetch(toApiUrl('/api/jarvis/v1/handler'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, memory: memoryContext }),
      });

      if (!response.ok) {
        throw new Error(`Jarvis API error: ${response.status}`);
      }

      const data = await response.json() as JarvisResponse;
      
      // Persist to memory
      await this.persistMemory(query, data.text);

      return data;
    } finally {
      this.isThinking = false;
    }
  }

  private async searchMemory(query: string): Promise<string[]> {
    try {
      const results = await mlWorker.vectorStoreSearch([query], 3, 0.4);
      return results.map(r => r.text);
    } catch (err) {
      console.warn('[JarvisService] Memory search failed:', err);
      return [];
    }
  }

  private async persistMemory(query: string, response: string): Promise<void> {
    try {
      const entry = `User: ${query}\nJarvis: ${response}`;
      await mlWorker.vectorStoreIngest([{
        text: entry,
        pubDate: Date.now(),
        source: 'jarvis-memory',
        url: 'local://jarvis'
      }]);
    } catch (err) {
      console.warn('[JarvisService] Memory persistence failed:', err);
    }
  }

  public getThinkingStatus(): boolean {
    return this.isThinking;
  }
}
