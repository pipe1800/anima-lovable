import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, Eye, Calendar } from 'lucide-react';

interface CharacterFoundationSectionProps {
  character: {
    id: string;
    name: string;
    short_description: string | null;
    avatar_url: string | null;
    visibility: string;
    created_at: string;
    creator?: {
      username: string;
      avatar_url: string | null;
    };
  };
}

export const CharacterFoundationSection: React.FC<CharacterFoundationSectionProps> = ({
  character
}) => {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center">
          <User className="w-5 h-5 mr-2 text-primary" />
          Foundation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar & Basic Info */}
        <div className="flex items-start space-x-4">
          <Avatar className="w-20 h-20 ring-2 ring-primary/50">
            <AvatarImage src={character.avatar_url || "/placeholder.svg"} alt={character.name} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-bold text-xl">
              {character.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground mb-2">{character.name}</h3>
            
            {character.short_description && (
              <p className="text-muted-foreground leading-relaxed mb-4">
                {character.short_description}
              </p>
            )}
            
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="bg-primary/20 text-primary">
                <Eye className="w-3 h-3 mr-1" />
                {character.visibility}
              </Badge>
              <Badge variant="outline" className="border-muted">
                <Calendar className="w-3 h-3 mr-1" />
                Created {new Date(character.created_at).toLocaleDateString()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Creator Info */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center space-x-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={character.creator?.avatar_url || "/placeholder.svg"} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {character.creator?.username?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-muted-foreground">Created by</p>
              <p className="text-primary font-medium">@{character.creator?.username || 'Unknown'}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};