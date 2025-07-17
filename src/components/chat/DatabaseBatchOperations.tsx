import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Database, AlertCircle, CheckCircle } from 'lucide-react';

interface DatabaseBatchOperationsProps {
  chatId: string | null;
  characterId: string;
  isVisible: boolean;
}

interface BatchOperation {
  id: string;
  type: 'message' | 'context' | 'addon' | 'user_activity';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: Date;
  data: any;
}

export const DatabaseBatchOperations: React.FC<DatabaseBatchOperationsProps> = ({
  chatId,
  characterId,
  isVisible
}) => {
  const [operations, setOperations] = useState<BatchOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchStats, setBatchStats] = useState({
    totalOps: 0,
    completedOps: 0,
    failedOps: 0,
    avgProcessingTime: 0
  });
  const { user } = useAuth();

  // Queue operations for batch processing
  const queueOperation = (type: BatchOperation['type'], data: any) => {
    const operation: BatchOperation = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      status: 'pending',
      timestamp: new Date(),
      data
    };
    
    setOperations(prev => [...prev, operation]);
    return operation.id;
  };

  // Process batch operations
  const processBatch = async () => {
    if (!user || !chatId || operations.length === 0) return;

    setIsProcessing(true);
    const startTime = Date.now();

    try {
      const pendingOps = operations.filter(op => op.status === 'pending');
      
      // Update operation status
      setOperations(prev => prev.map(op => 
        pendingOps.includes(op) ? { ...op, status: 'processing' } : op
      ));

      // Group operations by type for batch processing
      const messageOps = pendingOps.filter(op => op.type === 'message');
      const contextOps = pendingOps.filter(op => op.type === 'context');
      const addonOps = pendingOps.filter(op => op.type === 'addon');
      const activityOps = pendingOps.filter(op => op.type === 'user_activity');

      const batchPromises = [];

      // Batch message operations
      if (messageOps.length > 0) {
        const messageInserts = messageOps.map(op => ({
          chat_id: chatId,
          author_id: user.id,
          content: op.data.content,
          is_ai_message: op.data.is_ai_message,
          created_at: new Date().toISOString()
        }));

        batchPromises.push(
          supabase.from('messages').insert(messageInserts)
        );
      }

      // Batch context operations
      if (contextOps.length > 0) {
        const contextUpserts = contextOps.map(op => ({
          user_id: user.id,
          character_id: characterId,
          chat_id: chatId,
          context_type: op.data.context_type,
          current_context: op.data.current_context,
          updated_at: new Date().toISOString()
        }));

        batchPromises.push(
          supabase.from('user_chat_context').upsert(contextUpserts, {
            onConflict: 'user_id,character_id,chat_id,context_type'
          })
        );
      }

      // Batch addon operations
      if (addonOps.length > 0) {
        const addonUpserts = addonOps.map(op => ({
          user_id: user.id,
          character_id: characterId,
          addon_settings: op.data.addon_settings,
          updated_at: new Date().toISOString()
        }));

        batchPromises.push(
          supabase.from('user_character_addons').upsert(addonUpserts, {
            onConflict: 'user_id,character_id'
          })
        );
      }

      // Execute all batch operations
      const results = await Promise.allSettled(batchPromises);

      // Update operation statuses based on results
      let completedCount = 0;
      let failedCount = 0;

      results.forEach((result, index) => {
        const opsForThisBatch = [messageOps, contextOps, addonOps, activityOps][index] || [];
        
        if (result.status === 'fulfilled' && !result.value.error) {
          completedCount += opsForThisBatch.length;
          setOperations(prev => prev.map(op => 
            opsForThisBatch.includes(op) ? { ...op, status: 'completed' } : op
          ));
        } else {
          failedCount += opsForThisBatch.length;
          setOperations(prev => prev.map(op => 
            opsForThisBatch.includes(op) ? { ...op, status: 'failed' } : op
          ));
        }
      });

      // Update batch statistics
      const processingTime = Date.now() - startTime;
      setBatchStats(prev => ({
        totalOps: prev.totalOps + pendingOps.length,
        completedOps: prev.completedOps + completedCount,
        failedOps: prev.failedOps + failedCount,
        avgProcessingTime: (prev.avgProcessingTime + processingTime) / 2
      }));

      // Clean up completed operations after 5 seconds
      setTimeout(() => {
        setOperations(prev => prev.filter(op => op.status !== 'completed'));
      }, 5000);

    } catch (error) {
      console.error('Batch processing error:', error);
      setOperations(prev => prev.map(op => 
        op.status === 'processing' ? { ...op, status: 'failed' } : op
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-process batches every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      if (operations.some(op => op.status === 'pending')) {
        processBatch();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [operations, user, chatId, characterId]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 right-4 w-80 bg-[#1a1a2e] border border-gray-700 rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-[#FF7A00]" />
          <h3 className="text-white font-semibold">Database Operations</h3>
        </div>
        <div className="flex items-center space-x-1">
          {isProcessing && (
            <div className="w-2 h-2 bg-[#FF7A00] rounded-full animate-pulse"></div>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#121212] rounded p-2">
          <div className="text-xs text-gray-400">Total Ops</div>
          <div className="text-sm text-white font-semibold">{batchStats.totalOps}</div>
        </div>
        <div className="bg-[#121212] rounded p-2">
          <div className="text-xs text-gray-400">Success Rate</div>
          <div className="text-sm text-green-400 font-semibold">
            {batchStats.totalOps > 0 ? 
              Math.round((batchStats.completedOps / batchStats.totalOps) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Operation Queue */}
      <div className="max-h-32 overflow-y-auto">
        {operations.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-2">
            No operations queued
          </div>
        ) : (
          operations.slice(-5).map((op) => (
            <div key={op.id} className="flex items-center justify-between py-1 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-gray-300">{op.type}</span>
                <span className="text-gray-500">
                  {op.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                {op.status === 'completed' && (
                  <CheckCircle className="w-3 h-3 text-green-400" />
                )}
                {op.status === 'failed' && (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
                {op.status === 'processing' && (
                  <div className="w-3 h-3 border border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                )}
                <span className={`text-xs ${
                  op.status === 'completed' ? 'text-green-400' :
                  op.status === 'failed' ? 'text-red-400' :
                  op.status === 'processing' ? 'text-[#FF7A00]' : 'text-gray-400'
                }`}>
                  {op.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Performance Metrics */}
      <div className="mt-3 pt-2 border-t border-gray-700">
        <div className="text-xs text-gray-400">
          Avg Processing: {Math.round(batchStats.avgProcessingTime)}ms
        </div>
        <div className="text-xs text-gray-400">
          Queue: {operations.filter(op => op.status === 'pending').length} pending
        </div>
      </div>
    </div>
  );
};

export default DatabaseBatchOperations;