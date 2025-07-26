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
    </div>
  );
}
