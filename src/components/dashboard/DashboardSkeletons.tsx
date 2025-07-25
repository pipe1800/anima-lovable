import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function StatsCardSkeleton() {
  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 bg-gray-700" />
            <Skeleton className="h-8 w-16 bg-gray-700" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full bg-gray-700" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ChatCardSkeleton() {
  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50 h-[120px]">
      <CardContent className="p-4 h-full">
        <div className="flex h-full space-x-4">
          {/* Avatar skeleton */}
          <Skeleton className="w-16 h-16 rounded-full bg-gray-700 flex-shrink-0" />
          
          {/* Content skeleton */}
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-32 bg-gray-700" />
                <Skeleton className="h-4 w-48 bg-gray-700" />
              </div>
              <Skeleton className="h-8 w-20 bg-gray-700" />
            </div>
            <Skeleton className="h-3 w-full bg-gray-700" />
            <div className="flex items-center space-x-4">
              <Skeleton className="h-3 w-16 bg-gray-700" />
              <Skeleton className="h-3 w-24 bg-gray-700" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CharacterCardSkeleton() {
  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50 h-64 sm:h-80">
      <CardContent className="p-0 relative h-full">
        <Skeleton className="absolute inset-0 bg-gray-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 space-y-2">
          <Skeleton className="h-6 w-3/4 bg-gray-600" />
          <Skeleton className="h-4 w-1/2 bg-gray-600" />
          <div className="flex items-center space-x-4">
            <Skeleton className="h-4 w-12 bg-gray-600" />
            <Skeleton className="h-4 w-12 bg-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FavoriteCharacterSkeleton() {
  return (
    <Card className="bg-[#121212] border-gray-700/50 h-64 sm:h-80">
      <CardContent className="p-0 relative h-full">
        <Skeleton className="absolute inset-0 bg-gray-800" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4">
          <Skeleton className="h-5 sm:h-6 bg-gray-700 w-3/4" />
        </div>
        
        <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4">
          <div className="space-y-2 mb-3">
            <Skeleton className="h-3 bg-gray-700 w-full" />
            <Skeleton className="h-3 bg-gray-700 w-5/6" />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Skeleton className="h-4 w-12 bg-gray-700" />
              <Skeleton className="h-4 w-12 bg-gray-700" />
            </div>
            <Skeleton className="h-3 w-20 bg-gray-700" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
