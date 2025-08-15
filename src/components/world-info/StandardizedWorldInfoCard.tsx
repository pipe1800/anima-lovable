import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  BookOpen, 
  Heart, 
  Edit2, 
  Trash2, 
  Share2,
  Download,
  Copy,
  Eye,
  Users,
  FileText,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface StandardizedWorldInfoCardProps {
  worldInfo: any;
  isOwner?: boolean;
  showCreator?: boolean;
  onEdit?: (id: string) => void;
  className?: string;
  index?: number;
}

export default function StandardizedWorldInfoCard({ 
  worldInfo, 
  isOwner = false,
  showCreator = true,
  onEdit,
  className,
  index = 0
}: StandardizedWorldInfoCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Extract data with proper fallbacks for different data structures
  const {
    id,
    name,
    short_description,
    avatar_url,
    tags = [],
    creator,
    creator_id,
    profiles,
    world_info_entries = [],
    entriesCount = 0,
    entry_count = 0,
    likesCount = 0,
    likes_count = 0,
    like_count = 0,
    usage_count = 0,
    interaction_count = 0
  } = worldInfo;

  // Normalize data - handle both count properties and array lengths
  const totalEntries = entriesCount || entry_count || world_info_entries?.length || 0;
  const totalLikes = likesCount || likes_count || like_count || 0;
  const totalUses = (usage_count || 0) + (interaction_count || 0);
  const displayTags = tags.slice(0, 4);
  const creatorName = creator?.username || profiles?.username || 'Anonymous';
  const creatorAvatar = creator?.avatar_url || profiles?.avatar_url;

  const handleView = () => {
    navigate(`/world-info-view/${id}`);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Note: This would need to be implemented in world-info-operations
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      toast({
        title: "Success",
        description: "World info deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete world info",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleExport = () => {
    toast({
      title: "Coming Soon",
      description: "Export functionality will be available soon"
    });
  };

  const handleDuplicate = () => {
    toast({
      title: "Coming Soon",
      description: "Duplicate functionality will be available soon"
    });
  };

  const handleShare = () => {
    toast({
      title: "Coming Soon",
      description: "Share functionality will be available soon"
    });
  };

  return (
    <>
      <Card 
        className={cn(
          "bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-2xl hover:shadow-[#FF7A00]/20 group overflow-hidden hover:scale-105 hover:-translate-y-2 transform cursor-pointer flex flex-col h-full",
          className
        )}
        style={{
          animation: `fade-in 0.6s ease-out ${index * 0.1}s both`
        }}
        onClick={handleView}
      >
        <CardContent className="p-0 flex flex-col h-full">
          {/* Avatar Section */}
          <div className="relative h-32 bg-gradient-to-br from-[#FF7A00]/10 to-[#FF7A00]/5 flex items-center justify-center">
            <Avatar className="w-24 h-24 ring-4 ring-[#FF7A00]/30 group-hover:ring-[#FF7A00]/60 transition-all duration-300">
              {avatar_url ? (
                <AvatarImage src={avatar_url} alt={name} className="object-cover" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 text-white font-bold text-2xl">
                  <BookOpen className="w-8 h-8" />
                </AvatarFallback>
              )}
            </Avatar>
          </div>

          {/* Content Section */}
          <div className="p-3 flex flex-col flex-1">
            <div className="flex flex-col h-full">
              {/* Title - Fixed space */}
              <div className="mb-2">
                <h3 className="text-white font-medium text-lg group-hover:text-[#FF7A00] transition-colors line-clamp-1">
                  {name}
                </h3>
              </div>

              {/* Description - Fixed space */}
              <div className="mb-2 h-8">
                {short_description ? (
                  <p className="text-gray-400 text-xs line-clamp-2">
                    {short_description}
                  </p>
                ) : (
                  <div className="h-8"></div>
                )}
              </div>

              {/* Tags - Fixed space */}
              <div className="mb-2 h-5">
                {displayTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {displayTags.map((tag, idx) => (
                      <Badge 
                        key={idx}
                        variant="secondary"
                        className="text-[10px] bg-gray-700/50 text-gray-300 border-gray-600 px-1.5 py-0.5"
                      >
                        {typeof tag === 'string' ? tag : tag.name}
                      </Badge>
                    ))}
                    {tags.length > 4 && (
                      <Badge 
                        variant="secondary"
                        className="text-[10px] bg-gray-700/50 text-gray-300 border-gray-600 px-1.5 py-0.5"
                      >
                        +{tags.length - 4}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="h-5"></div>
                )}
              </div>

              {/* Spacer to push content to bottom */}
              <div className="flex-1"></div>

              {/* Stats - Always at same position */}
              <div className="mb-2">
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <div className="flex items-center gap-1 text-gray-300">
                    <FileText className="w-3 h-3 text-gray-400" />
                    <span>{totalEntries}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-300">
                    <Heart className="w-3 h-3 text-gray-400" />
                    <span>{totalLikes}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-300">
                    <Download className="w-3 h-3 text-gray-400" />
                    <span>{totalUses}</span>
                  </div>
                </div>
              </div>

              {/* Creator info - Fixed space */}
              <div className="mb-2">
                {showCreator ? (
                  <div className="pt-2 border-t border-gray-700/50 flex items-center gap-1.5">
                    <Avatar className="w-4 h-4">
                      {creatorAvatar ? (
                        <AvatarImage src={creatorAvatar} className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-gray-700 text-[10px]">
                          {creatorName[0]?.toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="text-xs text-gray-400">
                      by <span className="text-gray-300">@{creatorName}</span>
                    </span>
                  </div>
                ) : (
                  <div className="h-6"></div>
                )}
              </div>
            </div>

            {/* Action Button - Always at bottom */}
            <div className="pt-2 border-t border-gray-700/30">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleView();
                }}
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent"
              >
                <Eye className="w-3 h-3 mr-1" />
                View Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
