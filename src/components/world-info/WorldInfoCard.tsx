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
  onDelete,
  onDuplicate,
  onShare,
  onExport,
  onLike,
  showActions = true,
  isOwner = false,
  className
}: WorldInfoCardProps) {
  const {
    id,
    name,
    description,
    avatar_url,
    visibility,
    tags = [],
    profiles,
    entry_count = 0,
    like_count = 0,
    view_count = 0,
    is_liked = false,
    created_at
  } = worldInfo;

  const visibilityConfig = {
    private: { icon: Lock, label: 'Private', color: 'text-red-400' },
    unlisted: { icon: Users, label: 'Unlisted', color: 'text-yellow-400' },
    public: { icon: Globe, label: 'Public', color: 'text-green-400' }
  };

  const VisibilityIcon = visibilityConfig[visibility as keyof typeof visibilityConfig]?.icon || Lock;
  const visibilityLabel = visibilityConfig[visibility as keyof typeof visibilityConfig]?.label || 'Private';
  const visibilityColor = visibilityConfig[visibility as keyof typeof visibilityConfig]?.color || 'text-red-400';

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const truncateDescription = (text: string, maxLength: number = 120) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  return (
    <Card className={cn(
      "bg-[#1a1a2e] border-gray-700/50 hover:border-gray-600/50 transition-all duration-200 group",
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* Avatar and Title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="w-12 h-12 flex-shrink-0 border-2 border-gray-600">
              <AvatarImage src={avatar_url || undefined} alt={name} />
              <AvatarFallback className="bg-[#FF7A00] text-white font-semibold">
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <Link 
                to={`/world-info/${id}`}
                className="block group-hover:text-[#FF7A00] transition-colors"
              >
                <h3 className="font-semibold text-white text-lg leading-tight line-clamp-2">
                  {name}
                </h3>
              </Link>
              
              {/* Creator info */}
              {profiles && (
                <p className="text-xs text-gray-400 mt-1">
                  by {profiles.username || 'Anonymous'}
                </p>
              )}
              
              {/* Visibility and stats */}
              <div className="flex items-center gap-3 mt-2 text-xs">
                <div className={cn("flex items-center gap-1", visibilityColor)}>
                  <VisibilityIcon className="w-3 h-3" />
                  <span>{visibilityLabel}</span>
                </div>
                
                <div className="flex items-center gap-1 text-gray-400">
                  <BookOpen className="w-3 h-3" />
                  <span>{entry_count} entries</span>
                </div>
                
                {visibility === 'public' && (
                  <>
                    <div className="flex items-center gap-1 text-gray-400">
                      <Eye className="w-3 h-3" />
                      <span>{view_count}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-gray-400">
                      <Heart className="w-3 h-3" />
                      <span>{like_count}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-400 hover:text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-48 bg-[#1a1a2e] border-gray-700"
              >
                {isOwner && onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(id)} className="text-white">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => onDuplicate(id)} className="text-white">
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                )}
                
                {onExport && (
                  <DropdownMenuItem onClick={() => onExport(id)} className="text-white">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </DropdownMenuItem>
                )}
                
                {visibility === 'public' && onShare && (
                  <DropdownMenuItem onClick={() => onShare(id)} className="text-white">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                )}
                
                {isOwner && onDelete && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    <DropdownMenuItem 
                      onClick={() => onDelete(id)} 
                      className="text-red-400 focus:text-red-300"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Description */}
        {description && (
          <p className="text-gray-300 text-sm mb-3 leading-relaxed">
            {truncateDescription(description)}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.slice(0, 4).map((tag, index) => (
              <Badge 
                key={index} 
                variant="secondary"
                className="text-xs bg-gray-700/50 text-gray-300 border-gray-600"
              >
                {tag}
              </Badge>
            ))}
            {tags.length > 4 && (
              <Badge 
                variant="secondary"
                className="text-xs bg-gray-700/50 text-gray-300 border-gray-600"
              >
                +{tags.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
          <span className="text-xs text-gray-400">
            {formatDate(created_at)}
          </span>
          
          {/* Like button for public content */}
          {visibility === 'public' && onLike && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                onLike(id);
              }}
              className={cn(
                "p-2 transition-colors",
                is_liked 
                  ? "text-red-400 hover:text-red-300" 
                  : "text-gray-400 hover:text-red-400"
              )}
            >
              <Heart className={cn("w-4 h-4", is_liked && "fill-current")} />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
