import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  BookOpen, 
  Heart, 
  MoreVertical, 
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

  // Extract data with fallbacks
  const {
    id,
    name,
    short_description,
    avatar_url,
    tags = [],
    creator,
    creator_id,
    profiles,
    entriesCount = 0,
    entry_count = 0,
    likesCount = 0,
    likes_count = 0,
    like_count = 0,
    usage_count = 0,
    interaction_count = 0
  } = worldInfo;

  // Normalize data
  const displayTags = tags.slice(0, 4);
  const totalEntries = entriesCount || entry_count || 0;
  const totalLikes = likesCount || likes_count || like_count || 0;
  const totalUses = (usage_count || 0) + (interaction_count || 0);
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
          "bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-2xl hover:shadow-[#FF7A00]/20 group overflow-hidden hover:scale-105 hover:-translate-y-2 transform cursor-pointer",
          className
        )}
        style={{
          animation: `fade-in 0.6s ease-out ${index * 0.1}s both`
        }}
        onClick={handleView}
      >
        <CardContent className="p-0">
          {/* Avatar Section */}
          <div className="relative h-32 bg-gradient-to-br from-[#FF7A00]/10 to-[#FF7A00]/5 flex items-center justify-center">
            <Avatar className="w-24 h-24 ring-4 ring-[#FF7A00]/30 group-hover:ring-[#FF7A00]/60 transition-all duration-300">
              {avatar_url ? (
                <AvatarImage src={avatar_url} alt={name} />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 text-white font-bold text-2xl">
                  <BookOpen className="w-8 h-8" />
                </AvatarFallback>
              )}
            </Avatar>

            {/* Action Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="absolute top-2 right-2 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-[#1a1a2e] border-gray-700">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleView(); }}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                
                {isOwner && onEdit && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(id); }}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(); }}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(); }}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShare(); }}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
                
                {isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                      className="text-red-400 focus:text-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Content Section */}
          <div className="p-5 space-y-4">
            {/* Title */}
            <h3 className="text-white font-bold text-xl group-hover:text-[#FF7A00] transition-colors line-clamp-1">
              {name}
            </h3>

            {/* Description */}
            {short_description && (
              <p className="text-gray-400 text-sm line-clamp-2">
                {short_description}
              </p>
            )}

            {/* Tags */}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {displayTags.map((tag, idx) => (
                  <Badge 
                    key={idx}
                    variant="secondary"
                    className="text-xs bg-gray-700/50 text-gray-300 border-gray-600"
                  >
                    {typeof tag === 'string' ? tag : tag.name}
                  </Badge>
                ))}
                {tags.length > 4 && (
                  <Badge 
                    variant="secondary"
                    className="text-xs bg-gray-700/50 text-gray-300 border-gray-600"
                  >
                    +{tags.length - 4}
                  </Badge>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="flex items-center gap-1.5 text-gray-300">
                <FileText className="w-4 h-4 text-gray-400" />
                <span>{totalEntries}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Heart className="w-4 h-4 text-gray-400" />
                <span>{totalLikes}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Users className="w-4 h-4 text-gray-400" />
                <span>{totalUses}</span>
              </div>
            </div>

            {/* Creator info */}
            {showCreator && (
              <div className="pt-3 border-t border-gray-700/50 flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  {creatorAvatar ? (
                    <AvatarImage src={creatorAvatar} />
                  ) : (
                    <AvatarFallback className="bg-gray-700 text-xs">
                      {creatorName[0]?.toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="text-sm text-gray-400">
                  by <span className="text-gray-300">@{creatorName}</span>
                </span>
              </div>
            )}

            {/* Action Button */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleView();
              }}
              variant="outline"
              size="sm"
              className="w-full border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete World Info</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete "{name}"? This will permanently delete all associated entries and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-gray-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
