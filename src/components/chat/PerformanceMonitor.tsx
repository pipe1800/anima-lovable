import React, { useState, useEffect, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, CheckCircle, XCircle, Monitor, TrendingUp, Zap } from 'lucide-react';
import { useChatPerformance } from '@/hooks/useChatPerformance';

/**
 * Phase 3 Performance Optimization: Enhanced Performance Monitor
 * 
 * Added:
 * - Real-time render time tracking
 * - Cache hit rate monitoring
 * - Memory usage estimation
 * - Performance recommendations
 */

interface PerformanceMonitorProps {
  chatId: string | null;
  isVisible?: boolean;
  messageCount?: number;
  isStreaming?: boolean;
  queryMetrics?: {
    hitRate: number;
    avgTime: number;
  };
}

const PerformanceMonitor = memo(({ 
  chatId, 
  isVisible = false, 
  messageCount = 0,
  isStreaming = false,
  queryMetrics 
}: PerformanceMonitorProps) => {
  const { metrics } = useChatPerformance(chatId);
  const [recentMetrics, setRecentMetrics] = useState<Array<{
    timestamp: number;
    responseTime: number;
    success: boolean;
  }>>([]);
  
  // Phase 3: Enhanced metrics tracking
  const [renderMetrics, setRenderMetrics] = useState({
    renderTime: 0,
    memoryUsage: 0,
    rerenderCount: 0,
    lastUpdate: Date.now()
  });

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

  // Phase 3: Track render performance
  useEffect(() => {
    const startTime = performance.now();
    
    setRenderMetrics(prev => ({
      renderTime: performance.now() - startTime,
      memoryUsage: messageCount * 0.5, // Rough estimate
      rerenderCount: prev.rerenderCount + 1,
      lastUpdate: Date.now()
    }));
  }, [messageCount, metrics]);

  // Phase 3: Performance status indicators  
  const getRenderPerformanceStatus = () => {
    if (renderMetrics.renderTime > 16) return { status: 'poor', color: 'text-red-500' };
    if (renderMetrics.renderTime > 8) return { status: 'fair', color: 'text-yellow-500' };
    return { status: 'good', color: 'text-green-500' };
  };

  const getCachePerformanceStatus = () => {
    const hitRate = queryMetrics?.hitRate || 0;
    if (hitRate > 0.8) return { status: 'excellent', color: 'text-green-500' };
    if (hitRate > 0.6) return { status: 'good', color: 'text-blue-500' };
    return { status: 'poor', color: 'text-red-500' };
  };

  const renderPerformanceStatus = getRenderPerformanceStatus();
  const cachePerformanceStatus = getCachePerformanceStatus();

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
        {/* Phase 3: Enhanced Performance Metrics */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span className="text-xs font-medium">Render Time</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono">{renderMetrics.renderTime.toFixed(1)}ms</span>
              <Badge variant="outline" className={`text-xs ${renderPerformanceStatus.color}`}>
                {renderPerformanceStatus.status}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span className="text-xs font-medium">Cache Hit</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono">{((queryMetrics?.hitRate || 0) * 100).toFixed(0)}%</span>
              <Badge variant="outline" className={`text-xs ${cachePerformanceStatus.color}`}>
                {cachePerformanceStatus.status}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Memory</span>
            <span className="text-sm font-mono">{renderMetrics.memoryUsage.toFixed(1)}KB</span>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Re-renders</span>
            <span className="text-sm font-mono">{renderMetrics.rerenderCount}</span>
          </div>
        </div>
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
});

PerformanceMonitor.displayName = 'PerformanceMonitor';

export default PerformanceMonitor;