
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface DailyUsageWidgetProps {
  messagesUsed: number;
  dailyLimit: number;
}

export function DailyUsageWidget({ messagesUsed, dailyLimit }: DailyUsageWidgetProps) {
  const usagePercentage = (messagesUsed / dailyLimit) * 100;
  
  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-lg">Daily Message Limit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Messages Used</span>
            <span className="text-white font-medium">
              {messagesUsed} / {dailyLimit}
            </span>
          </div>
          <Progress 
            value={usagePercentage} 
            className="h-2 bg-gray-700"
            style={{
              '--progress-background': '#FF7A00'
            } as React.CSSProperties}
          />
        </div>
        <Button
          variant="link"
          className="text-[#FF7A00] hover:text-[#FF7A00]/80 p-0 h-auto text-sm"
        >
          Upgrade for Unlimited Messages
        </Button>
      </CardContent>
    </Card>
  );
}
