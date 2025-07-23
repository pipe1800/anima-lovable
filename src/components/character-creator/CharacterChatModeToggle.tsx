import React from 'react';
import { Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

interface CharacterChatModeToggleProps {
  chatMode: 'storytelling' | 'companion';
  onChange: (mode: 'storytelling' | 'companion') => void;
  showWarning?: boolean;
  disabled?: boolean;
}

export function CharacterChatModeToggle({
  chatMode,
  onChange,
  showWarning = true,
  disabled = false
}: CharacterChatModeToggleProps) {
  const isCompanionMode = chatMode === 'companion';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="chat-mode" className="text-base">
          Chat Style
        </Label>
        <div className="flex items-center space-x-2">
          <span className={`text-sm ${!isCompanionMode ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            Storytelling
          </span>
          <Switch
            id="chat-mode"
            checked={isCompanionMode}
            onCheckedChange={(checked) => onChange(checked ? 'companion' : 'storytelling')}
            disabled={disabled}
          />
          <span className={`text-sm ${isCompanionMode ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            Companion
          </span>
        </div>
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <p><strong>Storytelling:</strong> Rich descriptions, actions, and narrative elements</p>
        <p><strong>Companion:</strong> Pure dialogue-focused conversations, like texting</p>
      </div>

      {showWarning && isCompanionMode && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Companion Mode Active</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Changing this setting mid-chat will not affect ongoing conversations</li>
              <li>If the character's greeting or examples include descriptive text (*actions*, narration), 
                  the AI may still include them in responses</li>
              <li>This setting applies to all your chats with this character</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
