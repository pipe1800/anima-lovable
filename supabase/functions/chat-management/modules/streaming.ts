import type { StreamingUpdate, CORS_HEADERS } from '../types/streaming-interfaces.ts';

/**
 * Streaming optimization utilities
 * Handles efficient streaming with reduced database I/O and improved performance
 */

export class StreamingOptimizer {
  private updateBuffer: string = '';
  private lastDbUpdate: number = 0;
  private readonly UPDATE_INTERVAL = 1500; // 1.5 seconds
  private readonly BUFFER_THRESHOLD = 150; // characters

  constructor(private startTime: number) {}

  shouldUpdateDatabase(newContent: string): boolean {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastDbUpdate;
    const contentDelta = newContent.length - this.updateBuffer.length;
    
    const timeThreshold = timeSinceLastUpdate > this.UPDATE_INTERVAL;
    const sizeThreshold = contentDelta > this.BUFFER_THRESHOLD;
    
    if (timeThreshold || sizeThreshold) {
      this.lastDbUpdate = now;
      this.updateBuffer = newContent;
      return true;
    }
    
    return false;
  }

  processStreamChunk(chunk: string, fullResponse: string): StreamingUpdate {
    const shouldUpdate = this.shouldUpdateDatabase(fullResponse);
    
    return {
      content: chunk,
      shouldUpdateDatabase: shouldUpdate,
      isComplete: false
    };
  }

  createFinalUpdate(fullResponse: string): StreamingUpdate {
    return {
      content: fullResponse,
      shouldUpdateDatabase: true,
      isComplete: true
    };
  }

  getPerformanceMetrics() {
    const now = Date.now();
    return {
      totalTime: now - this.startTime,
      updateCount: this.lastDbUpdate > 0 ? 1 : 0,
      efficiency: this.updateBuffer.length / Math.max(1, this.lastDbUpdate - this.startTime)
    };
  }
}

export function createStreamingResponse(readable: ReadableStream): Response {
  return new Response(readable, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export function processStreamBuffer(buffer: string): { lines: string[], remainingBuffer: string } {
  const lines = buffer.split('\n');
  const remainingBuffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  return {
    lines: lines.filter(line => line.trim() !== ''),
    remainingBuffer
  };
}

export function parseStreamChunk(line: string): { content: string | null, isDone: boolean } {
  if (!line.startsWith('data: ')) {
    return { content: null, isDone: false };
  }

  const data = line.slice(6);
  
  if (data === '[DONE]') {
    return { content: null, isDone: true };
  }

  try {
    const parsed = JSON.parse(data);
    const content = parsed.choices?.[0]?.delta?.content || null;
    return { content, isDone: false };
  } catch (e) {
    console.error('Error parsing chunk:', e);
    return { content: null, isDone: false };
  }
}

export function createStreamingErrorResponse(error: string, model: string, plan: string): Response {
  const errorStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const errorMessage = `OpenRouter API failed (Status: ${error}). Model: ${model}. Plan: ${plan}. Please try again.`;
      
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"${errorMessage}"}}]}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });

  return createStreamingResponse(errorStream);
}
