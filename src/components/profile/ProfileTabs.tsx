
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CharacterGrid } from './CharacterGrid';
import { PersonasTab } from './PersonasTab';
import { getUserCharacters } from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

export const ProfileTabs = () => {
  const { user } = useAuth();

  const { data: characters = [] } = useQuery({
    queryKey: ['user-characters', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await getUserCharacters(user.id);
      return data || [];
    },
    enabled: !!user?.id,
  });

  return (
    <Tabs defaultValue="created" className="w-full">
      <TabsList className="grid w-full max-w-lg grid-cols-3 bg-[#1a1a1a] border-[#333]">
        <TabsTrigger 
          value="created" 
          className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
        >
          Creations
        </TabsTrigger>
        <TabsTrigger 
          value="personas"
          className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
        >
          Personas
        </TabsTrigger>
        <TabsTrigger 
          value="favorites"
          className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
        >
          Favorites
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="created" className="mt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white">Your Characters</h3>
            <p className="text-muted-foreground">{characters.length} characters created</p>
          </div>
          <CharacterGrid type="created" />
        </div>
      </TabsContent>
      
      <TabsContent value="personas" className="mt-6">
        <PersonasTab />
      </TabsContent>
      
      <TabsContent value="favorites" className="mt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white">Favorite Characters</h3>
            <p className="text-muted-foreground">0 characters favorited</p>
          </div>
          <CharacterGrid type="favorites" />
        </div>
      </TabsContent>
    </Tabs>
  );
};
