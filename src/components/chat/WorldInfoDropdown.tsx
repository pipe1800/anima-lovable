import React, { useState, useEffect } from 'react';
import { ChevronDown, BookOpen, Globe, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useTutorial } from '@/contexts/TutorialContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface WorldInfo {
  id: string;
  name: string;
  short_description: string | null;
  visibility: string;
  creator_id: string;
}

interface WorldInfoDropdownProps {
  isVisible: boolean;
  onWorldInfoSelect: (worldInfo: WorldInfo | null) => void;
  disabled?: boolean;
  selectedWorldInfoId?: string | null;
}

export const WorldInfoDropdown: React.FC<WorldInfoDropdownProps> = ({
  isVisible,
  onWorldInfoSelect,
  disabled = false,
  selectedWorldInfoId
}) => {
  const { user } = useAuth();
  const { handleStepAction } = useTutorial();
  const navigate = useNavigate();
  const [worldInfos, setWorldInfos] = useState<WorldInfo[]>([]);
  const [selectedWorldInfo, setSelectedWorldInfo] = useState<WorldInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorldInfos = async () => {
      if (!user) return;
      
      try {
        // Get user's own world infos
        const { data: ownWorldInfos } = await supabase
          .from('world_infos')
          .select('id, name, short_description, visibility, creator_id')
          .eq('creator_id', user.id);

        // Get user's world info collection (only these, no public world infos)
        const { data: userWorldInfos } = await supabase
          .from('world_info_users')
          .select(`
            world_info_id,
            world_infos (
              id,
              name,
              short_description,
              visibility,
              creator_id
            )
          `)
          .eq('user_id', user.id);

        const collectionWorldInfos = userWorldInfos
          ?.map(item => item.world_infos)
          .filter(Boolean) as WorldInfo[] || [];

        // Combine user's own world infos + world infos in collection
        const allWorldInfos = [
          ...(ownWorldInfos || []),
          ...collectionWorldInfos
        ];

        // Remove duplicates
        const uniqueWorldInfos = allWorldInfos.filter(
          (worldInfo, index, self) => 
            index === self.findIndex(w => w.id === worldInfo.id)
        );

        setWorldInfos(uniqueWorldInfos);
      } catch (error) {
        console.error('Error loading world infos:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      loadWorldInfos();
    }
  }, [isVisible, user]);

  // Sync selectedWorldInfoId prop with internal state
  useEffect(() => {
    if (selectedWorldInfoId && worldInfos.length > 0) {
      const worldInfo = worldInfos.find(w => w.id === selectedWorldInfoId);
      if (worldInfo) {
        setSelectedWorldInfo(worldInfo);
      }
    } else if (!selectedWorldInfoId) {
      setSelectedWorldInfo(null);
    }
  }, [selectedWorldInfoId, worldInfos]);

  const handleWorldInfoSelect = (worldInfo: WorldInfo | null) => {
    if (disabled) return;
    setSelectedWorldInfo(worldInfo);
    onWorldInfoSelect(worldInfo);
    
    // Notify tutorial system
    if (worldInfo) {
      handleStepAction('world-info-selected');
    }
  };

  // Clear selection when disabled
  useEffect(() => {
    if (disabled && selectedWorldInfo) {
      setSelectedWorldInfo(null);
      onWorldInfoSelect(null);
    }
  }, [disabled, selectedWorldInfo, onWorldInfoSelect]);

  const handleCreateWorldInfo = () => {
    navigate('/world-info-editor');
  };

  const handleDiscoverWorldInfos = () => {
    navigate('/discover?tab=world-infos');
  };

  if (!isVisible) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className={`px-3 ${
            disabled 
              ? 'text-gray-500 cursor-not-allowed opacity-50' 
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          data-tutorial="world-info-dropdown"
          disabled={disabled}
        >
          <div className="flex items-center space-x-2">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm">
              {disabled ? 'World Info (Disabled)' : (selectedWorldInfo?.name || 'Select World Info')}
            </span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 bg-[#1a1a2e] border-gray-700/50 z-50">
        <div className="p-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Select World Info</h3>
            <Badge variant="outline" className="border-[#FF7A00] text-[#FF7A00] text-xs">
              Dynamic
            </Badge>
          </div>

          {loading ? (
            <div className="text-gray-400 text-center py-4 text-sm">Loading world infos...</div>
          ) : worldInfos.length === 0 ? (
            <div className="space-y-3">
              <div className="text-gray-400 text-center py-4 text-sm">No world infos available</div>
              <DropdownMenuSeparator className="bg-gray-700/50" />
              <DropdownMenuItem
                onClick={handleCreateWorldInfo}
                className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer text-[#FF7A00]"
              >
                <Plus className="w-4 h-4" />
                <span>Create World Info</span>
              </DropdownMenuItem>
            </div>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {/* Clear selection option */}
              <DropdownMenuItem
                onClick={() => handleWorldInfoSelect(null)}
                className="flex items-center space-x-2 p-3 hover:bg-gray-800/50 cursor-pointer"
              >
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-400 font-medium text-sm">None</div>
                  <div className="text-gray-500 text-xs">No world info selected</div>
                </div>
                {(selectedWorldInfo === null && !selectedWorldInfoId) && (
                  <div className="w-2 h-2 bg-[#FF7A00] rounded-full" />
                )}
              </DropdownMenuItem>

              {worldInfos.map((worldInfo) => (
                <DropdownMenuItem
                  key={worldInfo.id}
                  onClick={() => handleWorldInfoSelect(worldInfo)}
                  className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer"
                >
                  <div className="w-8 h-8 bg-[#FF7A00] rounded-full flex items-center justify-center">
                    <Globe className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm truncate">{worldInfo.name}</div>
                    <div className="text-gray-400 text-xs truncate">
                      {worldInfo.short_description || 'No description'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {worldInfo.visibility === 'public' && (
                      <Badge variant="outline" className="border-blue-400 text-blue-400 text-xs">
                        Public
                      </Badge>
                    )}
                    {worldInfo.creator_id === user?.id && (
                      <Badge variant="outline" className="border-green-400 text-green-400 text-xs">
                        Mine
                      </Badge>
                    )}
                     {(selectedWorldInfo?.id === worldInfo.id || selectedWorldInfoId === worldInfo.id) && (
                      <div className="w-2 h-2 bg-[#FF7A00] rounded-full" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator className="bg-gray-700/50" />
              
              <DropdownMenuItem
                onClick={handleCreateWorldInfo}
                className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer text-[#FF7A00]"
              >
                <Plus className="w-4 h-4" />
                <span>Create New World Info</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem
                onClick={handleDiscoverWorldInfos}
                className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer text-[#FF7A00]"
              >
                <Globe className="w-4 h-4" />
                <span>Discover World Infos</span>
              </DropdownMenuItem>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};