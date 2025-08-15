import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, MessageCircle, User, Bot, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { CharacterFormData } from '@/hooks/useCharacterCreation';
import { estimateCreatorTokenUsage } from '@/utils/tokenCounter';
import { useAuth } from '@/contexts/AuthContext';

interface DialogueStepProps {
  data: CharacterFormData;
  onUpdate: (data: Partial<CharacterFormData>) => void;
  onNext: () => void;
  onPrevious: () => void;
}

interface DialoguePair {
  user: string;
  character: string;
}

interface DialogueFormData {
  greeting: string;
  example_dialogues: DialoguePair[];
}

const DialogueStep = ({ data, onUpdate, onNext, onPrevious }: DialogueStepProps) => {
  const formMethods = useForm<DialogueFormData>({
    defaultValues: {
      greeting: data.dialogue?.greeting || '',
      example_dialogues: data.dialogue?.example_dialogues?.length > 0 
        ? data.dialogue.example_dialogues 
        : [{ user: '', character: '' }]
    }
  });

  const { control, handleSubmit, watch, reset } = formMethods;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "example_dialogues"
  });

  const watchedValues = watch();
  const { subscription } = useAuth();
  const planName = subscription?.plan?.name || 'Guest Pass';

  // Multi-greeting state (primary + alternates)
  const [greetings, setGreetings] = useState<string[]>(() => {
    const primary = data.dialogue?.greeting || '';
    const alts = data.dialogue?.alternate_greetings || [];
    return [primary, ...alts].filter((g) => g !== undefined && g !== null);
  });
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Collapsible Example Dialogues
  const [showExamples, setShowExamples] = useState<boolean>(false);

  // Token meter state
  const [tokenInfo, setTokenInfo] = useState(() => estimateCreatorTokenUsage(data, planName, greetings[0] || ''));

  // Update form data when character data is loaded
  useEffect(() => {
    if (data.dialogue) {
      reset({
        greeting: data.dialogue.greeting || '',
        example_dialogues: data.dialogue.example_dialogues?.length > 0 
          ? data.dialogue.example_dialogues 
          : [{ user: '', character: '' }]
      });
      const primary = data.dialogue.greeting || '';
      const alts = data.dialogue.alternate_greetings || [];
      setGreetings([primary, ...alts]);
      setCurrentIndex(0);
    }
  }, [data, reset]);

  // Recompute token usage when relevant fields change
  useEffect(() => {
    const formSnapshot: CharacterFormData = {
      ...data,
      dialogue: {
        ...data.dialogue,
        greeting: greetings[currentIndex] || ''
      }
    } as CharacterFormData;
    setTokenInfo(estimateCreatorTokenUsage(formSnapshot, planName, greetings[currentIndex] || ''));
  }, [greetings, currentIndex, data, planName]);

  const addDialoguePair = () => {
    append({ user: '', character: '' });
  };

  const removeDialoguePair = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  // Greeting variant handlers
  const updateCurrentGreeting = (value: string) => {
    setGreetings((prev) => prev.map((g, i) => (i === currentIndex ? value : g)));
  };

  const addGreetingVariant = () => {
    setGreetings((prev) => {
      const next = [...prev];
      const insertAt = Math.min(currentIndex + 1, next.length);
      next.splice(insertAt, 0, '');
      return next;
    });
    setCurrentIndex((idx) => Math.min(idx + 1, greetings.length));
  };

  const removeCurrentGreeting = () => {
    setGreetings((prev) => {
      if (prev.length <= 1) return prev; // Keep at least one
      const next = prev.filter((_, i) => i !== currentIndex);
      // Adjust index
      if (currentIndex >= next.length) {
        setCurrentIndex(next.length - 1);
      }
      return next;
    });
  };

  const goPrev = () => {
    setCurrentIndex((idx) => (idx - 1 + greetings.length) % greetings.length);
  };

  const goNext = () => {
    setCurrentIndex((idx) => (idx + 1) % greetings.length);
  };

  const handleNext = () => {
    const validDialoguePairs = (watchedValues.example_dialogues || []).filter(pair => 
      (pair.user || '').trim() && (pair.character || '').trim()
    );

    // Prepare greeting + alternates from state
    const trimmed = greetings.map((g) => (g || '').trim());
    const filtered = trimmed.filter((g) => g.length > 0);
    const primary = filtered[ currentIndex < filtered.length ? currentIndex : 0 ] || '';
    const alternates = filtered.filter((_, i) => i !== currentIndex);

    // Prevent continue if total token budget would be exceeded
    if (tokenInfo.totals.overTotal || tokenInfo.totals.overPermanent) {
      return;
    }
    
    onUpdate({
      dialogue: {
        greeting: primary,
        alternate_greetings: alternates,
        example_dialogues: validDialoguePairs // optional
      }
    });
    onNext();
  };

  const isValidGreeting = (greetings[currentIndex] || '').trim().length > 0;
  const isValid = isValidGreeting && !tokenInfo.totals.overTotal && !tokenInfo.totals.overPermanent;

  return (
    <FormProvider {...formMethods}>
      <div className="flex-1 overflow-auto bg-[#121212]">
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 md:mb-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-4 truncate">
            Define Their Voice
          </h2>
          <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto">
            Shape how your character speaks. Their voice is their personality in action.
          </p>
        </div>

        {/* Token Meter */}
        <div className="mb-4 p-3 md:p-4 rounded-xl border border-gray-700/50 bg-gray-800/30">
          <div className="flex items-center justify-between text-xs md:text-sm text-gray-300">
            <span>Token usage</span>
            <span>
              {tokenInfo.totals.totalUsed.toLocaleString()} / {tokenInfo.totals.maxTokens.toLocaleString()} tokens
            </span>
          </div>
          <div className="mt-2 h-2 rounded bg-gray-700 overflow-hidden">
            <div
              className={`h-full ${tokenInfo.totals.overTotal ? 'bg-red-500' : 'bg-[#FF7A00]'}`}
              style={{ width: `${Math.min(100, (tokenInfo.totals.totalUsed / Math.max(1, tokenInfo.totals.maxTokens)) * 100)}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] md:text-xs text-gray-400">
            <div>Definition: {(tokenInfo.breakdown.personalitySummary + tokenInfo.breakdown.description).toLocaleString()}</div>
            <div>Scenario+Notes: {(tokenInfo.breakdown.scenario + tokenInfo.breakdown.characterNotes).toLocaleString()}</div>
            <div>Greeting: {tokenInfo.breakdown.greeting.toLocaleString()}</div>
          </div>
          {tokenInfo.totals.overTotal && (
            <p className="mt-2 text-red-400 text-xs md:text-sm">Over 3,500 token limit. Reduce fields to continue.</p>
          )}
        </div>

        <div className="space-y-6 md:space-y-10">
          {/* Greeting Message */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="greeting" className="text-white text-lg md:text-xl font-medium block">
                Opening Greeting <span className="text-[#FF7A00]">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={greetings.length <= 1}
                  className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800/50 disabled:opacity-50"
                  aria-label="Previous greeting"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-gray-400 text-xs md:text-sm">
                  Greeting {Math.min(currentIndex + 1, greetings.length)} of {greetings.length}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={greetings.length <= 1}
                  className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800/50 disabled:opacity-50"
                  aria-label="Next greeting"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-gray-400 text-sm md:text-base mb-4 md:mb-6">
              Manage all greetings below. One will be chosen at random at chat start.
            </p>
            
            <div className="relative">
              <MessageCircle className="absolute left-3 md:left-4 top-3 md:top-4 w-4 h-4 md:w-5 md:h-5 text-gray-400" />
              <Textarea
                id="greeting"
                placeholder="Type a greeting variant..."
                value={greetings[currentIndex] || ''}
                onChange={(e) => updateCurrentGreeting(e.target.value)}
                rows={6}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-xl resize-none text-sm md:text-base leading-relaxed pl-10 md:pl-12 pt-3 md:pt-4"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addGreetingVariant}
                className="flex items-center gap-2 text-[#FF7A00] hover:text-[#FF7A00]/80 transition-colors p-2 rounded-lg hover:bg-[#FF7A00]/10 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add variant
              </button>
              {greetings.length > 1 && (
                <button
                  type="button"
                  onClick={removeCurrentGreeting}
                  className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-red-400/10 text-sm"
                >
                  <X className="w-4 h-4" />
                  Remove current
                </button>
              )}
            </div>

            {/* Compact list of greetings for quick navigation */}
            {greetings.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                {greetings.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentIndex(i)}
                    className={`w-full text-left p-2 rounded-lg border ${i === currentIndex ? 'border-[#FF7A00] bg-[#FF7A00]/10' : 'border-gray-700 bg-gray-800/30'} text-gray-200 hover:bg-gray-800/50 transition-colors`}
                    title={g.length > 120 ? g : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30">{i + 1}</span>
                      <span className="text-sm line-clamp-2 break-words">{g || 'Empty variant'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Example Dialogues (Optional) */}
          <div className="border border-gray-700/60 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowExamples(v => !v)}
              className="w-full flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-gray-800/40 hover:bg-gray-800/60 transition-colors"
            >
              <div>
                <Label className="text-white text-lg md:text-xl font-medium">Example Dialogues (Optional)</Label>
                <p className="text-gray-400 text-xs md:text-sm">Use examples to further shape the voice. You can skip this.</p>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform ${showExamples ? 'rotate-180' : ''}`} />
            </button>

            {showExamples && (
              <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-gray-800/20">
                <div className="space-y-4 md:space-y-6">
                  {fields.map((field, index) => (
                    <div key={field.id} className="bg-gray-800/30 rounded-xl p-4 md:p-5 border border-gray-700/50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-white font-medium text-sm md:text-base">
                          Dialogue Example {index + 1}
                        </h4>
                        {fields.length > 1 && (
                          <button
                            onClick={() => removeDialoguePair(index)}
                            className="p-1.5 md:p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:gap-4">
                        {/* User Message */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
                            <Label className="text-blue-400 font-medium text-sm md:text-base">
                              {'{{user}}'} message
                            </Label>
                          </div>
                          <Textarea
                            placeholder="What the user might say..."
                            {...formMethods.register(`example_dialogues.${index}.user`)}
                            rows={2}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 rounded-lg resize-none text-xs md:text-sm"
                          />
                        </div>

                        {/* Character Response */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#FF7A00]" />
                            <Label className="text-[#FF7A00] font-medium text-sm md:text-base">
                              {'{{char}}'} response
                            </Label>
                          </div>
                          <Textarea
                            placeholder="How your character responds..."
                            {...formMethods.register(`example_dialogues.${index}.character`)}
                            rows={2}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 rounded-lg resize-none text-xs md:text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addDialoguePair}
                  className="flex items-center gap-2 text-[#FF7A00] hover:text-[#FF7A00]/80 transition-colors p-2 md:p-3 rounded-lg hover:bg-[#FF7A00]/10 text-sm md:text-base"
                >
                  <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>Add another dialogue example</span>
                </button>
              </div>
            )}
          </div>

          {/* Tips Section (2x2, compact) */}
          <div className="bg-gray-800/30 rounded-xl p-4 md:p-5 border border-gray-700/50">
            <h4 className="text-white font-medium mb-3 text-sm md:text-base">💡 Dialogue Tips</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-xs md:text-sm text-gray-300">
              <div>
                <strong className="text-[#FF7A00]">Be specific:</strong>
                <p className="mt-1">Show unique speech patterns, catchphrases, or vocabulary your character uses.</p>
              </div>
              <div>
                <strong className="text-[#FF7A00]">Show personality:</strong>
                <p className="mt-1">Let their traits shine through their responses - humor, sarcasm, kindness, etc.</p>
              </div>
              <div>
                <strong className="text-[#FF7A00]">Vary scenarios:</strong>
                <p className="mt-1">Include different types of conversations - casual, serious, playful, deep.</p>
              </div>
              <div>
                <strong className="text-[#FF7A00]">Stay consistent:</strong>
                <p className="mt-1">Keep the voice consistent to reinforce their speaking style.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 mt-8 md:mt-12 pt-4 md:pt-6 border-t border-gray-700/50">
          <Button
            onClick={onPrevious}
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-800/50 px-6 md:px-8 py-2.5 md:py-3 rounded-xl text-sm md:text-base order-2 sm:order-1"
          >
            ← Previous
          </Button>
          
          <Button
            onClick={handleNext}
            disabled={!isValid}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-6 md:px-8 py-2.5 md:py-3 text-base md:text-lg font-semibold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
          >
            <span className="hidden sm:inline">Next: Finalize →</span>
            <span className="sm:hidden">Next →</span>
          </Button>
        </div>
        </div>
      </div>
    </FormProvider>
  );
};

export default DialogueStep;
