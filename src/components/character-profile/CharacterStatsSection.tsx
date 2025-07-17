import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, MessageCircle, Heart, Calendar, Eye } from 'lucide-react';

interface CharacterStatsSectionProps {
  character: {
    interaction_count: number;
    visibility: string;
    created_at: string;
    actual_chat_count?: number;
    likes_count?: number;
  };
}

export const CharacterStatsSection: React.FC<CharacterStatsSectionProps> = ({
  character
}) => {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-primary" />
          Quick Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Conversations</span>
          <Badge variant="secondary" className="bg-primary/20 text-primary">
            {character.actual_chat_count?.toLocaleString() || 0}
          </Badge>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Likes</span>
          <Badge variant="secondary" className="bg-primary/20 text-primary">
            {character.likes_count?.toLocaleString() || 0}
          </Badge>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Visibility</span>
          <Badge 
            variant="secondary" 
            className={character.visibility === 'public' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}
          >
            <Eye className="w-3 h-3 mr-1" />
            {character.visibility}
          </Badge>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Created</span>
          <span className="text-muted-foreground text-sm">
            <Calendar className="w-3 h-3 inline mr-1" />
            {new Date(character.created_at).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};