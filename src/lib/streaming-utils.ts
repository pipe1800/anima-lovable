export class StreamingMessageParser {
  private buffer = '';
  private decoder = new TextDecoder();

  parseChunk(chunk: Uint8Array): string[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    return lines
      .filter(line => line.trim())
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice(6));
  }

  reset() {
    this.buffer = '';
  }
}

export const parseSSEMessage = (data: string): any | null => {
  if (data === '[DONE]') return { done: true };
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
