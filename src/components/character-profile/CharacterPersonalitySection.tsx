import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, BookOpen, Tag } from 'lucide-react';

interface CharacterPersonalitySectionProps {
  character: {
    character_definitions?: {
      personality_summary: string;
      description: string | null;
    };
  };
  tags?: Array<{ id: number; name: string }>;
}

export const CharacterPersonalitySection: React.FC<CharacterPersonalitySectionProps> = ({
  character,
  tags = []
}) => {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center">
          <Star className="w-5 h-5 mr-2 text-primary" />
          Personality
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Core Personality */}
        {character.character_definitions?.personality_summary && (
          <div>
            <h4 className="font-medium text-foreground mb-3 flex items-center">
              <Star className="w-4 h-4 mr-2 text-primary" />
              Core Personality
            </h4>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {character.character_definitions.personality_summary}
            </p>
          </div>
        )}

        {/* Detailed Description */}
        {character.character_definitions?.description && (
          <div className="pt-4 border-t border-border">
            <h4 className="font-medium text-foreground mb-3 flex items-center">
              <BookOpen className="w-4 h-4 mr-2 text-primary" />
              Detailed Description
            </h4>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {character.character_definitions.description}
            </p>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="pt-4 border-t border-border">
            <h4 className="font-medium text-foreground mb-3 flex items-center">
              <Tag className="w-4 h-4 mr-2 text-primary" />
              Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="bg-primary/10 text-primary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};