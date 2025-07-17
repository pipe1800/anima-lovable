import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useChatPerformance } from '@/hooks/useChatPerformance';

interface PerformanceMonitorProps {
  chatId: string | null;
  isVisible?: boolean;
}

const PerformanceMonitor = ({ chatId, isVisible = false }: PerformanceMonitorProps) => {
  const { metrics } = useChatPerformance(chatId);
  const [recentMetrics, setRecentMetrics] = useState<Array<{
    timestamp: number;
    responseTime: number;
    success: boolean;
  }>>([]);

  useEffect(() => {
    if (metrics.lastResponseTime > 0) {
      setRecentMetrics(prev => [
        ...prev.slice(-19), // Keep last 20 entries
        {
          timestamp: Date.now(),
          responseTime: metrics.lastResponseTime,
          success: true
        }
      ]);
    }
  }, [metrics.lastResponseTime]);

  const getPerformanceColor = (time: number) => {
    if (time < 2000) return 'text-green-500';
    if (time < 4000) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getPerformanceStatus = (time: number) => {
    if (time < 2000) return 'Excellent';
    if (time < 4000) return 'Good';
    if (time < 6000) return 'Fair';
    return 'Poor';
  };

  if (!isVisible) return null;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5" />
          Performance Monitor
        </CardTitle>
        <CardDescription>
          Real-time chat performance metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Performance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Average Response Time</span>
            <Badge variant="outline" className={getPerformanceColor(metrics.averageResponseTime)}>
              {getPerformanceStatus(metrics.averageResponseTime)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className={`text-sm font-mono ${getPerformanceColor(metrics.averageResponseTime)}`}>
              {metrics.averageResponseTime}ms
            </span>
          </div>
          <Progress 
            value={Math.min(100, (metrics.averageResponseTime / 8000) * 100)} 
            className="h-2"
          />
        </div>

        {/* Success Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Success Rate</span>
            <div className="flex items-center gap-1">
              {metrics.successRate >= 95 ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className="text-sm font-mono">
                {metrics.successRate.toFixed(1)}%
              </span>
            </div>
          </div>
          <Progress 
            value={metrics.successRate} 
            className="h-2"
          />
        </div>

        {/* Message Statistics */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="text-center">
            <div className="text-lg font-bold text-primary">
              {metrics.totalMessages}
            </div>
            <div className="text-xs text-muted-foreground">
              Total Messages
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-500">
              {metrics.errors}
            </div>
            <div className="text-xs text-muted-foreground">
              Errors
            </div>
          </div>
        </div>

        {/* Recent Performance Trend */}
        {recentMetrics.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Recent Performance</span>
            <div className="flex items-end gap-1 h-8">
              {recentMetrics.slice(-10).map((metric, index) => (
                <div
                  key={index}
                  className={`flex-1 bg-current opacity-70 rounded-sm ${getPerformanceColor(metric.responseTime)}`}
                  style={{ height: `${Math.min(100, (metric.responseTime / 8000) * 100)}%` }}
                  title={`${metric.responseTime}ms`}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PerformanceMonitor;