import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableFieldProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  disabled?: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  className?: string;
  displayClassName?: string;
  validation?: (value: string) => string | null;
}

export const EditableField: React.FC<EditableFieldProps> = ({
  value,
  onSave,
  placeholder = "Click to edit",
  multiline = false,
  maxLength,
  disabled = false,
  isEditing,
  onEditStart,
  onEditEnd,
  className,
  displayClassName,
  validation
}) => {
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const validationError = validation?.(editValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    
    try {
      await onSave(editValue);
      onEditEnd();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setError(null);
    onEditEnd();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isEditing) {
    return (
      <div
        onClick={disabled ? undefined : onEditStart}
        className={cn(
          "group cursor-pointer rounded-md transition-all duration-200",
          !disabled && "hover:bg-muted/50",
          displayClassName
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex-1",
            (!value || value.length === 0) && "text-muted-foreground italic"
          )}>
            {value || placeholder}
          </span>
          {!disabled && (
            <Edit2 className="w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity" />
          )}
        </div>
      </div>
    );
  }

  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start gap-2">
        <InputComponent
          ref={inputRef as any}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isSaving}
          className={cn(
            "flex-1",
            error && "border-destructive focus:border-destructive"
          )}
          rows={multiline ? 3 : undefined}
        />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={isSaving || editValue === value}
            className="h-8 w-8 p-0"
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {maxLength && (
        <p className="text-xs text-muted-foreground text-right">
          {editValue.length}/{maxLength}
        </p>
      )}
    </div>
  );
};
