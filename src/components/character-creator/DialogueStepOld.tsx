
import React, { useEffect } from 'react';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, MessageCircle, User, Bot } from 'lucide-react';

interface DialogueStepProps {
  data: any;
  onUpdate: (data: any) => void;
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

  // Update form data when character data is loaded
  useEffect(() => {
    if (data.dialogue) {
      reset({
        greeting: data.dialogue.greeting || '',
        example_dialogues: data.dialogue.example_dialogues?.length > 0 
          ? data.dialogue.example_dialogues 
          : [{ user: '', character: '' }]
      });
    }
  }, [data, reset]);

  const addDialoguePair = () => {
    append({ user: '', character: '' });
  };

  const removeDialoguePair = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const handleNext = () => {
    const validDialoguePairs = watchedValues.example_dialogues.filter(pair => 
      pair.user.trim() && pair.character.trim()
    );
    
    onUpdate({
      dialogue: {
        greeting: watchedValues.greeting,
        example_dialogues: validDialoguePairs
      }
    });
    onNext();
  };

  const isValid = watchedValues.greeting?.trim() && watchedValues.example_dialogues?.some(pair => pair.user?.trim() && pair.character?.trim());

  return (
    <FormProvider {...formMethods}>
      <div className="flex-1 overflow-auto bg-[#121212]">
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 md:mb-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-4">
            Define Their Voice
          </h2>
          <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto">
            Shape how your character speaks and interacts. Their voice is their personality in action.
          </p>
        </div>

        <div className="space-y-6 md:space-y-10">
          {/* Greeting Message */}
          <div className="space-y-4">
            <Label htmlFor="greeting" className="text-white text-lg md:text-xl font-medium block">
              Opening Greeting *
            </Label>
            <p className="text-gray-400 text-sm md:text-base mb-4 md:mb-6">
              The first message your character sends when someone starts chatting. Make it engaging and true to their personality.
            </p>
            
            <div className="relative">
              <MessageCircle className="absolute left-3 md:left-4 top-3 md:top-4 w-4 h-4 md:w-5 md:h-5 text-gray-400" />
              <Textarea
                id="greeting"
                placeholder="Hey there! Ready to dive into some digital chaos? I've got stories that'll make your neural implants tingle..."
                {...formMethods.register('greeting')}
                rows={3}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-xl resize-none text-sm md:text-base leading-relaxed pl-10 md:pl-12 pt-3 md:pt-4"
              />
            </div>
            
            {watchedValues.greeting && (
              <div className="mt-4 p-3 md:p-4 bg-gradient-to-r from-[#FF7A00]/10 to-transparent rounded-lg border border-[#FF7A00]/20">
                <p className="text-[#FF7A00] font-medium mb-2 text-sm md:text-base">Preview:</p>
                <p className="text-white italic text-sm md:text-base">"{watchedValues.greeting}"</p>
              </div>
            )}
          </div>

          {/* Example Dialogues */}
          <div className="space-y-4 md:space-y-6">
            <div>
              <Label className="text-white text-lg md:text-xl font-medium block mb-2">
                Example Dialogues (The Matrix) *
              </Label>
              <p className="text-gray-400 text-sm md:text-base mb-4 md:mb-6">
                Create conversation examples to train your character's voice. Show how they respond to different types of messages. This is the most powerful tool for shaping their personality.
              </p>
            </div>

            <div className="space-y-4 md:space-y-6">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-gray-800/30 rounded-xl p-4 md:p-6 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-4">
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

                  <div className="grid grid-cols-1 gap-4">
                    {/* User Message */}
                    <div className="space-y-2 md:space-y-3">
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
                    <div className="space-y-2 md:space-y-3">
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

          {/* Tips Section */}
          <div className="bg-gray-800/30 rounded-xl p-4 md:p-6 border border-gray-700/50">
            <h4 className="text-white font-medium mb-3 text-sm md:text-base">💡 Dialogue Tips:</h4>
            <div className="grid grid-cols-1 gap-3 md:gap-4 text-xs md:text-sm text-gray-300">
              <div>
                <strong className="text-[#FF7A00]">Be specific:</strong>
                <p>Show unique speech patterns, catchphrases, or vocabulary your character uses.</p>
              </div>
              <div>
                <strong className="text-[#FF7A00]">Show personality:</strong>
                <p>Let their traits shine through their responses - humor, sarcasm, kindness, etc.</p>
              </div>
              <div>
                <strong className="text-[#FF7A00]">Vary scenarios:</strong>
                <p>Include different types of conversations - casual, serious, playful, deep.</p>
              </div>
              <div>
                <strong className="text-[#FF7A00]">Stay consistent:</strong>
                <p>Keep the voice consistent across all examples to reinforce their speaking style.</p>
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
