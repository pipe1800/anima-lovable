import { useQuery } from '@tanstack/react-query';
import { getUserCharacterAddonSettings } from '@/lib/user-addon-operations';
import { useAuth } from '@/contexts/AuthContext';

export const useAddonSettings = (characterId: string) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['addon-settings', user?.id, characterId],
    queryFn: async () => {
      if (!user?.id || !characterId) return null;
      return await getUserCharacterAddonSettings(user.id, characterId);
    },
    enabled: !!user?.id && !!characterId,
    staleTime: 0, // Always consider data stale for real-time updates
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });
};