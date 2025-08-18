import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Upload, X, Type, Image as ImageIcon } from 'lucide-react';
import { useUserGlobalChatSettings, useUpdateGlobalChatSettings, useUpdateBackgroundImage } from '@/queries/chatSettingsQueries';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ChatStyleTabProps {
  currentChatId?: string | null;
  onUnsavedChange?: (has: boolean) => void;
  discardSignal?: number;
  onSaved?: () => void;
}

export const ChatStyleTab: React.FC<ChatStyleTabProps> = ({ currentChatId, onUnsavedChange, discardSignal, onSaved }) => {
  const { data: settings } = useUserGlobalChatSettings();
  const updateGlobalSettings = useUpdateGlobalChatSettings();
  const updateBackground = useUpdateBackgroundImage();
  const { user } = useAuth();

  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Partial<{
    streaming_mode: 'instant' | 'smooth';
    font_size: 'small' | 'normal' | 'large';
    ai_text_color: string;
    user_text_color: string;
    show_character_avatar: boolean;
    show_user_avatar: boolean;
    background_image_url: string | null;
    ai_bubble_color: string;
    ai_bubble_opacity: number;
    user_bubble_color: string;
    user_bubble_opacity: number;
    // New semantic highlighting controls
    semantic_overrides_mode: 'default' | 'custom' | 'disabled';
    speech_color: string | null;
    action_color: string | null;
    emphasis_color: string | null;
    parenthetical_color: string | null;
    // New avatar style controls
    avatar_style: 'classic' | 'bubble-bg' | 'portrait' | 'side-banner';
    portrait_frame_style: 'clean' | 'polaroid' | 'foil';
    portrait_frame_color: string;
    banner_width: 'sm' | 'md' | 'lg';
    banner_tint_from_avatar: boolean;
  }>>({});

  // Rebuild effective using current settings + pending
  const effective = {
    streaming_mode: pending.streaming_mode ?? settings?.streaming_mode ?? 'smooth',
    font_size: pending.font_size ?? settings?.font_size ?? 'normal',
    ai_text_color: pending.ai_text_color ?? settings?.ai_text_color ?? '#E5E7EB',
    user_text_color: pending.user_text_color ?? settings?.user_text_color ?? '#FFFFFF',
    show_character_avatar: pending.show_character_avatar ?? settings?.show_character_avatar ?? true,
    show_user_avatar: pending.show_user_avatar ?? settings?.show_user_avatar ?? false,
    background_image_url: pending.background_image_url ?? settings?.background_image_url ?? null,
    ai_bubble_color: pending.ai_bubble_color ?? settings?.ai_bubble_color ?? '#1f2937',
    ai_bubble_opacity: pending.ai_bubble_opacity ?? settings?.ai_bubble_opacity ?? 0.9,
    user_bubble_color: pending.user_bubble_color ?? settings?.user_bubble_color ?? '#FF7A00',
    user_bubble_opacity: pending.user_bubble_opacity ?? settings?.user_bubble_opacity ?? 1,
    semantic_overrides_mode: pending.semantic_overrides_mode ?? settings?.semantic_overrides_mode ?? 'default',
    speech_color: (pending.speech_color ?? settings?.speech_color ?? null) as string | null,
    action_color: (pending.action_color ?? settings?.action_color ?? null) as string | null,
    emphasis_color: (pending.emphasis_color ?? settings?.emphasis_color ?? null) as string | null,
    parenthetical_color: (pending.parenthetical_color ?? settings?.parenthetical_color ?? null) as string | null,
    // New avatar style fields
    avatar_style: pending.avatar_style ?? settings?.avatar_style ?? 'classic',
    portrait_frame_style: pending.portrait_frame_style ?? settings?.portrait_frame_style ?? 'clean',
    portrait_frame_color: pending.portrait_frame_color ?? settings?.portrait_frame_color ?? '#4B5563',
    banner_width: pending.banner_width ?? settings?.banner_width ?? 'md',
    banner_tint_from_avatar: pending.banner_tint_from_avatar ?? settings?.banner_tint_from_avatar ?? false,
  } as any;

  const setField = (key: keyof typeof effective, value: any) => {
    setPending(prev => ({ ...prev, [key]: value }));
  };

  // Report unsaved changes up
  useEffect(() => {
    onUnsavedChange?.(Object.keys(pending).length > 0);
  }, [pending, onUnsavedChange]);

  // Discard hook from parent
  const [lastDiscard, setLastDiscard] = useState<number | undefined>(discardSignal);
  useEffect(() => {
    if (discardSignal !== undefined && discardSignal !== lastDiscard) {
      setLastDiscard(discardSignal);
      setPending({});
    }
  }, [discardSignal, lastDiscard]);

  const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setSaving(true);
      // Upload to storage now so preview works, but do not persist DB setting until Save
      const ext = file.name.split('.').pop() || 'png';
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');
      const path = `backgrounds/${userId}.${ext}`;
      const uploadRes = await supabase.storage.from('user-style').upload(path, file, { upsert: true, contentType: file.type });
      if (uploadRes.error) throw uploadRes.error;
      const { data: pub } = supabase.storage.from('user-style').getPublicUrl(path);
      setField('background_image_url', pub.publicUrl);
    } catch (e) {
      console.error('Background upload failed', e);
    } finally {
      setSaving(false);
    }
  };

  const clearBackground = async () => {
    // Only mark pending change; persist on Save
    setField('background_image_url', null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (Object.keys(pending).length > 0) {
        // Persist all pending style settings
        await updateGlobalSettings.mutateAsync(pending as any);
        // Persist background image if present/cleared via dedicated endpoint
        if ('background_image_url' in pending) {
          await updateBackground.mutateAsync(pending.background_image_url ?? null);
        }
      }
      setPending({});
      // Notify parent after successful save
      onSaved?.();
    } catch (e) {
      console.error('Failed to save style settings', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => setPending({});

  const renderBubblePreview = (text: string, color: string, opacity: number, textColor: string) => {
    // Convert hex color + opacity to rgba
    const hex = color?.replace('#','');
    const r = parseInt(hex.substring(0,2), 16) || 0;
    const g = parseInt(hex.substring(2,4), 16) || 0;
    const b = parseInt(hex.substring(4,6), 16) || 0;
    const a = Math.min(Math.max(opacity ?? 1, 0), 1);
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    return (
      <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor, color: textColor }}>
        {text}
      </div>
    );
  };

  // Helper: preview semantic segment class/style based on current effective settings
  const getSegmentClass = (type: 'speech' | 'action' | 'emphasis' | 'parenthetical') => {
    if (effective.semantic_overrides_mode === 'disabled' || effective.semantic_overrides_mode === 'custom') return '';
    switch (type) {
      case 'speech': return 'text-blue-300';
      case 'action': return 'text-purple-300 italic';
      case 'emphasis': return 'font-semibold text-yellow-300';
      case 'parenthetical': return 'text-gray-400 italic';
    }
  };
  const getSegmentStyle = (type: 'speech' | 'action' | 'emphasis' | 'parenthetical'): React.CSSProperties | undefined => {
    if (effective.semantic_overrides_mode === 'custom') {
      if (type === 'speech' && effective.speech_color) return { color: effective.speech_color };
      if (type === 'action' && effective.action_color) return { color: effective.action_color, fontStyle: 'italic' };
      if (type === 'emphasis' && effective.emphasis_color) return { color: effective.emphasis_color, fontWeight: 600 };
      if (type === 'parenthetical' && effective.parenthetical_color) return { color: effective.parenthetical_color, fontStyle: 'italic' };
    }
    if (effective.semantic_overrides_mode === 'disabled') {
      // use overall color only; preserve italics/bold for readability
      if (type === 'action') return { fontStyle: 'italic' };
      if (type === 'emphasis') return { fontWeight: 600 };
      if (type === 'parenthetical') return { fontStyle: 'italic' };
      return undefined;
    }
    return undefined;
  };
  const renderTextPreview = (label: string, baseColor: string) => (
    <div className="rounded-md bg-black/20 border border-white/5 p-3">
      <div className="text-[11px] text-gray-400 mb-1">{label}</div>
      <div className="text-sm" style={{ color: baseColor }}>
        <span>Hello </span>
        <span className={getSegmentClass('speech')} style={getSegmentStyle('speech')}>
          "world"
        </span>
        <span> </span>
        <span className={getSegmentClass('action')} style={getSegmentStyle('action')}>
          *waves*
        </span>
        <span> </span>
        <span className={getSegmentClass('emphasis')} style={getSegmentStyle('emphasis')}>
          _important_
        </span>
        <span> </span>
        <span className={getSegmentClass('parenthetical')} style={getSegmentStyle('parenthetical')}>
          (note)
        </span>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-6 pb-16">
      {/* Response Mode */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
          
            <h3 className="text-white font-medium text-sm">Response Mode</h3>
          </div>
        </div>
        <RadioGroup value={effective.streaming_mode} onValueChange={(v) => setField('streaming_mode', v)} className="flex gap-6">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="instant" id="instant" />
            <Label htmlFor="instant" className="cursor-pointer text-gray-300">
              <div className="flex flex-col">
                <span className="font-medium text-white">Instant</span>
                <span className="text-xs text-gray-400">Complete response at once</span>
              </div>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="smooth" id="smooth" />
            <Label htmlFor="smooth" className="cursor-pointer text-gray-300">
              <div className="flex flex-col">
                <span className="font-medium text-white">Smooth</span>
                <span className="text-xs text-gray-400">Real-time streaming</span>
              </div>
            </Label>
          </div>
        </RadioGroup>
      </Card>

      {/* Text Style (Font Size + Text Colors + Semantic) */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
  
            <h3 className="text-white font-medium text-sm">Text Style</h3>
          </div>
        </div>

        {/* Font Size */}
        <div className="mb-4">
          <Label className="text-gray-300 text-sm">Font Size</Label>
          <RadioGroup value={effective.font_size} onValueChange={(v) => setField('font_size', v)} className="mt-2 flex gap-6">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="small" id="ts-small" />
              <Label htmlFor="ts-small" className="cursor-pointer text-gray-300"><span className="font-medium text-white text-sm">Small</span></Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="normal" id="ts-normal" />
              <Label htmlFor="ts-normal" className="cursor-pointer text-gray-300"><span className="font-medium text-white">Normal</span></Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="large" id="ts-large" />
              <Label htmlFor="ts-large" className="cursor-pointer text-gray-300"><span className="font-medium text-white text-lg">Large</span></Label>
            </div>
          </RadioGroup>
        </div>

        <hr className="border-gray-700/50 my-3" />

        {/* Overall Text Colors */}
        <div className="mb-4">
          <Label className="text-gray-300 text-sm">Overall Text Colors</Label>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">Character Text</Label>
              <input type="color" value={effective.ai_text_color} onChange={(e) => setField('ai_text_color', e.target.value)} className="w-full h-9 p-1 rounded bg-gray-800 border border-gray-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">Your Text</Label>
              <input type="color" value={effective.user_text_color} onChange={(e) => setField('user_text_color', e.target.value)} className="w-full h-9 p-1 rounded bg-gray-800 border border-gray-700" />
            </div>
          </div>
        </div>

        <hr className="border-gray-700/50 my-3" />

        {/* Semantic Highlighting */}
        <div className="space-y-3">
          <div>
            <Label className="text-gray-300 text-sm">Semantic Highlighting</Label>
            <RadioGroup value={effective.semantic_overrides_mode} onValueChange={(v) => setField('semantic_overrides_mode', v)} className="mt-2 flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="sem-default" value="default" />
                <Label htmlFor="sem-default" className="text-gray-300 cursor-pointer">Default</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="sem-custom" value="custom" />
                <Label htmlFor="sem-custom" className="text-gray-300 cursor-pointer">Custom</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="sem-disabled" value="disabled" />
                <Label htmlFor="sem-disabled" className="text-gray-300 cursor-pointer">Disabled</Label>
              </div>
            </RadioGroup>
          </div>

          {effective.semantic_overrides_mode === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">Quoted Speech</Label>
                <input type="color" value={effective.speech_color ?? '#93C5FD'} onChange={(e) => setField('speech_color', e.target.value)} className="w-full h-9 p-1 rounded bg-gray-800 border border-gray-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">Action (*...*)</Label>
                <input type="color" value={effective.action_color ?? '#D8B4FE'} onChange={(e) => setField('action_color', e.target.value)} className="w-full h-9 p-1 rounded bg-gray-800 border border-gray-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">Emphasis (_..._)</Label>
                <input type="color" value={effective.emphasis_color ?? '#FDE68A'} onChange={(e) => setField('emphasis_color', e.target.value)} className="w-full h-9 p-1 rounded bg-gray-800 border border-gray-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">Parenthetical (...)</Label>
                <input type="color" value={effective.parenthetical_color ?? '#9CA3AF'} onChange={(e) => setField('parenthetical_color', e.target.value)} className="w-full h-9 p-1 rounded bg-gray-800 border border-gray-700" />
              </div>
            </div>
          )}

          {/* Live Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {renderTextPreview('Character Preview', effective.ai_text_color)}
            {renderTextPreview('Your Preview', effective.user_text_color)}
          </div>

          <p className="text-[11px] text-gray-500">Default = built-in colors; Custom = your chosen colors; Disabled = no semantic colors (all text uses overall color). Token styles (italics/bold) are preserved.</p>
        </div>
      </Card>

      {/* Chat Background */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium text-sm">Chat Background</h3>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">Recommended size: 1920x1080px for best display</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-300 text-sm">Background Image</span>
            {effective.background_image_url && (
              <Button variant="ghost" size="sm" onClick={clearBackground} className="text-gray-400 hover:text-red-400 p-1">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="relative">
            <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" id="background-upload" />
            <label htmlFor="background-upload" className="cursor-pointer block w-full h-20 rounded-lg border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden bg-gray-800/50">
              {effective.background_image_url ? (
                <div className="relative w-full h-full">
                  <img src={effective.background_image_url} alt="Background preview" className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-medium">Change Image</span>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                  <span className="text-sm text-gray-400">Upload background image</span>
                </div>
              )}
            </label>
          </div>
        </div>
      </Card>

      {/* Bubble Styles */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Bubble Styles</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI Bubble */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 text-sm">Character Bubble</Label>
              {renderBubblePreview('Hello there!', effective.ai_bubble_color, effective.ai_bubble_opacity, effective.ai_text_color)}
            </div>
            <div className="grid grid-cols-3 gap-3 items-center">
              <span className="text-xs text-gray-400 col-span-1">Color</span>
              <input type="color" value={effective.ai_bubble_color} onChange={(e) => setField('ai_bubble_color', e.target.value)} className="h-9 p-1 rounded bg-gray-800 border border-gray-700 col-span-2" />
            </div>
            <div className="grid grid-cols-3 gap-3 items-center">
              <span className="text-xs text-gray-400 col-span-1">Opacity</span>
              <input type="range" min={0} max={100} step={1} value={Math.round((effective.ai_bubble_opacity ?? 1) * 100)} onChange={(e) => setField('ai_bubble_opacity', Math.min(Math.max(Number(e.target.value) / 100, 0), 1) as any)} className="col-span-2" />
            </div>
          </div>
          {/* User Bubble */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 text-sm">Your Bubble</Label>
              {renderBubblePreview('Got it!', effective.user_bubble_color, effective.user_bubble_opacity, effective.user_text_color)}
            </div>
            <div className="grid grid-cols-3 gap-3 items-center">
              <span className="text-xs text-gray-400 col-span-1">Color</span>
              <input type="color" value={effective.user_bubble_color} onChange={(e) => setField('user_bubble_color', e.target.value)} className="h-9 p-1 rounded bg-gray-800 border border-gray-700 col-span-2" />
            </div>
            <div className="grid grid-cols-3 gap-3 items-center">
              <span className="text-xs text-gray-400 col-span-1">Opacity</span>
              <input type="range" min={0} max={100} step={1} value={Math.round((effective.user_bubble_opacity ?? 1) * 100)} onChange={(e) => setField('user_bubble_opacity', Math.min(Math.max(Number(e.target.value) / 100, 0), 1) as any)} className="col-span-2" />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Tip: Text colors above still apply inside bubbles. Semantic colors (speech/action/emphasis) override the overall text color.</p>
      </Card>

      {/* Avatar Options */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Avatar Options</h3>
        </div>
        <div className="space-y-4">
          {/* Avatar Style Selector */}
          <div>
            <Label className="text-gray-300 text-sm mb-3 block">Avatar Style</Label>
            <RadioGroup value={effective.avatar_style} onValueChange={(v) => setField('avatar_style', v)} className="space-y-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="style-classic" value="classic" />
                <Label htmlFor="style-classic" className="text-gray-300 cursor-pointer">
                  <div className="flex flex-col">
                    <span className="font-medium text-white">Classic</span>
                    <span className="text-xs text-gray-400">Traditional avatar display</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="style-bubble-bg" value="bubble-bg" />
                <Label htmlFor="style-bubble-bg" className="text-gray-300 cursor-pointer">
                  <div className="flex flex-col">
                    <span className="font-medium text-white">Bubble Background</span>
                    <span className="text-xs text-gray-400">Avatar becomes chat bubble background</span>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-300 text-sm">Show Character Avatar</span>
            <Switch checked={effective.show_character_avatar} onCheckedChange={(v) => setField('show_character_avatar', v)} className="data-[state=checked]:bg-[#FF7A00]" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300 text-sm">Show Your Avatar</span>
            <Switch checked={effective.show_user_avatar} onCheckedChange={(v) => setField('show_user_avatar', v)} className="data-[state=checked]:bg-[#FF7A00]" />
          </div>
        </div>
      </Card>

      {/* Sticky footer with actions */}
      <div className="sticky bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-gray-700/50 p-2 mt-2">
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleDiscard} disabled={saving} className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 text-sm">Discard</Button>
          <Button onClick={handleSave} disabled={saving || Object.keys(pending).length === 0} className="bg-[#FF7A00] hover:bg-[#FF8A10] text-white shadow-lg text-sm">
            {saving ? (<><div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</>) : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
};
