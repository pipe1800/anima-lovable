import { logger } from '../../_shared/logger.ts';
/**
 * Streaming optimization utilities
 * Handles efficient streaming with reduced database I/O and improved performance
 */ export class StreamingOptimizer {
  startTime;
  updateBuffer;
  lastDbUpdate;
  UPDATE_INTERVAL;
  BUFFER_THRESHOLD;
  constructor(startTime){
    this.startTime = startTime;
    this.updateBuffer = '';
    this.lastDbUpdate = 0;
    this.UPDATE_INTERVAL = 1500;
    this.BUFFER_THRESHOLD = 150;
  }
  shouldUpdateDatabase(newContent) {
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
  processStreamChunk(chunk, fullResponse) {
    const shouldUpdate = this.shouldUpdateDatabase(fullResponse);
    return {
      content: chunk,
      shouldUpdateDatabase: shouldUpdate,
      isComplete: false
    };
  }
  createFinalUpdate(fullResponse) {
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
export function createStreamingResponse(readable) {
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
export function processStreamBuffer(buffer) {
  const lines = buffer.split('\n');
  const remainingBuffer = lines.pop() || ''; // Keep incomplete line in buffer
  return {
    lines: lines.filter((line)=>line.trim() !== ''),
    remainingBuffer
  };
}
export function parseStreamChunk(line) {
  if (!line.startsWith('data: ')) {
    return {
      content: null,
      isDone: false
    };
  }
  const data = line.slice(6);
  if (data === '[DONE]') {
    return {
      content: null,
      isDone: true
    };
  }
  try {
    const parsed = JSON.parse(data);
    const content = parsed.choices?.[0]?.delta?.content || null;
    return {
      content,
      isDone: false
    };
  } catch (e) {
    console.error('Error parsing chunk:', e);
    return {
      content: null,
      isDone: false
    };
  }
}
export function createStreamingErrorResponse(error, model, plan) {
  const errorStream = new ReadableStream({
    start (controller) {
      const encoder = new TextEncoder();
      const errorMessage = `OpenRouter API failed (Status: ${error}). Model: ${model}. Plan: ${plan}. Please try again.`;
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"${errorMessage}"}}]}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });
  return createStreamingResponse(errorStream);
}
export function streamAIResponse(opts) {
  const encoder = new TextEncoder();
  const { aiResponse, onChunk, onComplete, onError, sse = true, includeDoneEnvelope = true } = opts;
  const readable = new ReadableStream({
    async start (controller) {
      let full = '';
      try {
        const reader = aiResponse.body?.getReader();
        if (!reader) throw new Error('No reader');
        let buffer = '';
        while(true){
          const { done, value } = await reader.read();
          if (done) break;
          buffer += new TextDecoder().decode(value, {
            stream: true
          });
          const { lines, remainingBuffer } = processStreamBuffer(buffer);
          buffer = remainingBuffer;
          for (const line of lines){
            if (!line.trim()) continue;
            const { content, isDone } = parseStreamChunk(line);
            if (isDone) {
              if (includeDoneEnvelope) {
                const donePayload = JSON.stringify({
                  done: true
                });
                controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
              }
              if (onComplete) await onComplete(full.trim());
              controller.close();
              return;
            }
            if (content) {
              full += content;
              if (onChunk) await onChunk(content, full);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                content
              })}\n\n`));
            }
          }
        }
        if (includeDoneEnvelope) controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true
        })}\n\n`));
        if (onComplete) await onComplete(full.trim());
        controller.close();
      } catch (e) {
        logger.error('stream.pipeline.error', {
          message: e?.message
        });
        if (onError) await onError(e);
        controller.error(e);
      }
    }
  });
  return new Response(readable, {
    headers: {
      'Content-Type': sse ? 'text/event-stream' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
