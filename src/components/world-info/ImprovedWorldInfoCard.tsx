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
  Lock,
  Globe,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { deleteWorldInfo } from '@/lib/world-info-operations';
import { useQueryClient } from '@tanstack/react-query';
import type { WorldInfoWithDetails } from '@/hooks/useWorldInfos';

interface WorldInfoCardProps {
  worldInfo: WorldInfoWithDetails;
  onEdit?: (id: string) => void;
  isOwner?: boolean;
  className?: string;
}

export default function WorldInfoCard({ 
  worldInfo, 
  onEdit,
  isOwner = false,
  className 
}: WorldInfoCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleView = () => {
    navigate(`/world-info-view/${worldInfo.id}`);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteWorldInfo(worldInfo.id);
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

  const visibilityIcon = {
    private: <Lock className="w-3 h-3" />,
    unlisted: <Eye className="w-3 h-3" />,
    public: <Globe className="w-3 h-3" />
  };

  const visibilityColor = {
    private: 'bg-gray-500/20 text-gray-400',
    unlisted: 'bg-yellow-500/20 text-yellow-400',
    public: 'bg-green-500/20 text-green-400'
  };

  return (
    <>
      <Card 
        className={cn(
          "bg-gray-800/50 border-gray-700 hover:border-[#FF7A00]/50 transition-all duration-200 hover:shadow-lg cursor-pointer",
          className
        )}
        onClick={handleView}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-gray-700">
                <BookOpen className="w-5 h-5 text-gray-400" />
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white truncate">
                    {worldInfo.name}
                  </h3>
                  <p className="text-sm text-gray-400 line-clamp-2 mt-1">
                    {worldInfo.short_description || "No description"}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleView(); }}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                    
                    {isOwner && (
                      <>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(worldInfo.id); }}>
                          <Edit2 className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(); }}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                      </>
                    )}
                    
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(); }}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* TODO: Share */ }}>
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
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {worldInfo.entriesCount || 0}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" />
              {worldInfo.likesCount || 0}
            </span>
            <Badge variant="secondary" className={cn("text-xs px-2 py-0", visibilityColor[worldInfo.visibility as keyof typeof visibilityColor])}>
              {visibilityIcon[worldInfo.visibility as keyof typeof visibilityIcon]}
              <span className="ml-1">{worldInfo.visibility}</span>
            </Badge>
          </div>

          {/* Tags */}
          {worldInfo.tags && worldInfo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {worldInfo.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
              {worldInfo.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{worldInfo.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete World Info</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete "{worldInfo.name}"? This will permanently delete all associated entries and cannot be undone.
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
