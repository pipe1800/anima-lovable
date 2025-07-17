import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, User, Bot } from 'lucide-react';

interface DialoguePair {
  user: string;
  character: string;
}

interface CharacterDialogueSectionProps {
  character: {
    character_definitions?: {
      greeting: string | null;
    };
  };
  exampleDialogues?: DialoguePair[];
}

export const CharacterDialogueSection: React.FC<CharacterDialogueSectionProps> = ({
  character,
  exampleDialogues = []
}) => {
  if (!character.character_definitions?.greeting && exampleDialogues.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center">
          <MessageCircle className="w-5 h-5 mr-2 text-primary" />
          Dialogue & Voice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Greeting */}
        {character.character_definitions?.greeting && (
          <div>
            <h4 className="font-medium text-foreground mb-3 flex items-center">
              <MessageCircle className="w-4 h-4 mr-2 text-primary" />
              Opening Greeting
            </h4>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-foreground italic leading-relaxed">
                "{character.character_definitions.greeting}"
              </p>
            </div>
          </div>
        )}

        {/* Example Dialogues */}
        {exampleDialogues.length > 0 && (
          <div className="pt-4 border-t border-border">
            <h4 className="font-medium text-foreground mb-3">
              Example Conversations
            </h4>
            <div className="space-y-4">
              {exampleDialogues.slice(0, 3).map((dialogue, index) => (
                <div key={index} className="bg-muted/30 rounded-lg p-4 border border-border">
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center space-x-1 text-blue-400 text-sm font-medium mt-1">
                        <User className="w-3 h-3" />
                        <span>User</span>
                      </div>
                      <p className="text-muted-foreground text-sm flex-1 leading-relaxed">
                        {dialogue.user}
                      </p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center space-x-1 text-primary text-sm font-medium mt-1">
                        <Bot className="w-3 h-3" />
                        <span>Character</span>
                      </div>
                      <p className="text-foreground text-sm flex-1 leading-relaxed">
                        {dialogue.character}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {exampleDialogues.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  And {exampleDialogues.length - 3} more conversation examples...
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};