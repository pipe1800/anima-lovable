import { useState, useCallback, useRef } from 'react';

export interface ChatMetrics {
  averageResponseTime: number;
  successRate: number;
  totalMessages: number;
  errors: number;
  lastResponseTime: number;
}

export const useChatPerformance = (chatId: string | null) => {
  const [metrics, setMetrics] = useState<ChatMetrics>({
    averageResponseTime: 0,
    successRate: 100,
    totalMessages: 0,
    errors: 0,
    lastResponseTime: 0
  });

  const responseTimes = useRef<number[]>([]);

  const updateMetrics = useCallback((responseTime: number, isError = false) => {
    setMetrics(prev => {
      const newTotalMessages = prev.totalMessages + 1;
      const newErrors = prev.errors + (isError ? 1 : 0);
      
      // Keep only last 50 response times for rolling average
      responseTimes.current.push(responseTime);
      if (responseTimes.current.length > 50) {
        responseTimes.current.shift();
      }
      
      const averageResponseTime = responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length;
      const successRate = ((newTotalMessages - newErrors) / newTotalMessages) * 100;

      return {
        averageResponseTime: Math.round(averageResponseTime),
        successRate: Math.round(successRate),
        totalMessages: newTotalMessages,
        errors: newErrors,
        lastResponseTime: responseTime
      };
    });
  }, []);

  const resetMetrics = useCallback(() => {
    responseTimes.current = [];
    setMetrics({
      averageResponseTime: 0,
      successRate: 100,
      totalMessages: 0,
      errors: 0,
      lastResponseTime: 0
    });
  }, []);

  return {
    metrics,
    updateMetrics,
    resetMetrics
  };
};
