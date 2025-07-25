import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function CharacterCardSkeleton() {
  return (
    <Card className="bg-[#121212] border-gray-700/50 relative overflow-hidden h-64 sm:h-80">
      <CardContent className="p-0 relative h-full">
        {/* Skeleton background */}
        <div className="absolute inset-0 bg-gray-800 animate-pulse" />
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Skeleton name */}
        <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4">
          <div className="h-5 sm:h-6 bg-gray-700 rounded animate-pulse w-3/4" />
        </div>
        
        {/* Skeleton description and stats */}
        <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4">
          <div className="space-y-2 mb-3">
            <div className="h-3 bg-gray-700 rounded animate-pulse" />
            <div className="h-3 bg-gray-700 rounded animate-pulse w-5/6" />
          </div>
          
          {/* Skeleton stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-4 w-12 bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-12 bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="h-3 w-20 bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
