import React, { useEffect } from 'react';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Plus, X, MessageCircle, User, Bot, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  }, [data.dialogue, reset]);

  // Watch for changes and update parent
  useEffect(() => {
    const subscription = watch((value) => {
      onUpdate({
        dialogue: {
          greeting: value.greeting || '',
          example_dialogues: value.example_dialogues || []
        }
      });
    });
    return () => subscription.unsubscribe();
  }, [watch, onUpdate]);

  const addDialoguePair = () => {
    append({ user: '', character: '' });
  };

  const removeDialoguePair = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const handleNext = () => {
    const formData = watchedValues;
    onUpdate({
      dialogue: {
        greeting: formData.greeting || '',
        example_dialogues: formData.example_dialogues || []
      }
    });
    onNext();
  };

  // Validation
  const isValid = watchedValues.greeting?.trim() && 
                  watchedValues.example_dialogues?.some(dialogue => 
                    dialogue.user?.trim() && dialogue.character?.trim()
                  );

  return (
    <FormProvider {...formMethods}>
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6 md:space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              Dialogue & Voice
            </h2>
            <p className="text-gray-400 text-sm md:text-base max-w-2xl mx-auto">
              Define how your character speaks and responds. The greeting and example dialogues shape their unique voice and conversation style.
            </p>
          </div>

          {/* Opening Greeting */}
          <Card className="bg-[#1a1a2e] border-gray-700/50 p-6 md:p-8">
            <div className="space-y-4">
              <Label htmlFor="greeting" className="text-white text-lg font-medium flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#FF7A00]" />
                Opening Greeting *
              </Label>
              <p className="text-gray-400 text-sm">
                The first message your character sends when someone starts chatting. Make it engaging and true to their personality.
              </p>
              
              <div className="space-y-3">
                <Textarea
                  id="greeting"
                  placeholder="Hey there! Ready to dive into some digital chaos? I've got stories that'll make your neural implants tingle..."
                  {...formMethods.register('greeting')}
                  rows={3}
                  className={cn(
                    "bg-gray-800/50 border-gray-600 text-white placeholder-gray-400",
                    "resize-none text-sm md:text-base leading-relaxed p-4",
                    "focus:ring-[#FF7A00]/50 focus:border-[#FF7A00]/50"
                  )}
                />
                
                {watchedValues.greeting && (
                  <div className="p-4 bg-gradient-to-r from-[#FF7A00]/10 to-transparent rounded-lg border border-[#FF7A00]/20">
                    <p className="text-[#FF7A00] font-medium mb-2 text-sm">Preview:</p>
                    <p className="text-white italic text-sm">"{watchedValues.greeting}"</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Example Dialogues */}
          <Card className="bg-[#1a1a2e] border-gray-700/50 p-6 md:p-8">
            <div className="space-y-6">
              <div>
                <Label className="text-white text-lg font-medium flex items-center gap-2 mb-2">
                  <Bot className="w-5 h-5 text-[#FF7A00]" />
                  Example Dialogues *
                </Label>
                <p className="text-gray-400 text-sm">
                  Create conversation examples to train your character's voice. Show how they respond to different types of messages.
                </p>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <Card key={field.id} className="bg-gray-800/30 border-gray-600/50 p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-white font-medium text-sm md:text-base">
                        Example {index + 1}
                      </h4>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeDialoguePair(index)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* User Message */}
                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-400" />
                          User says:
                        </Label>
                        <Textarea
                          {...formMethods.register(`example_dialogues.${index}.user`)}
                          placeholder="What would a user say to your character?"
                          rows={2}
                          className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 resize-none text-sm"
                        />
                      </div>

                      {/* Character Response */}
                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm flex items-center gap-2">
                          <Bot className="w-4 h-4 text-[#FF7A00]" />
                          Character responds:
                        </Label>
                        <Textarea
                          {...formMethods.register(`example_dialogues.${index}.character`)}
                          placeholder="How would your character respond? Show their personality!"
                          rows={3}
                          className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 resize-none text-sm"
                        />
                      </div>
                    </div>
                  </Card>
                ))}

                {/* Add More Button */}
                <Button
                  type="button"
                  onClick={addDialoguePair}
                  variant="outline"
                  className="w-full border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 border-dashed py-6"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Another Example
                </Button>
              </div>
            </div>
          </Card>

          {/* Tips Section */}
          <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-700/30 p-6">
            <h4 className="text-blue-200 font-medium mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Dialogue Writing Tips
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="text-[#FF7A00] font-medium">Be Specific:</div>
                <p className="text-blue-100/80 text-xs leading-relaxed">
                  Show unique speech patterns, catchphrases, or vocabulary your character uses.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[#FF7A00] font-medium">Show Personality:</div>
                <p className="text-blue-100/80 text-xs leading-relaxed">
                  Let their traits shine through - humor, sarcasm, kindness, wisdom, etc.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[#FF7A00] font-medium">Vary Scenarios:</div>
                <p className="text-blue-100/80 text-xs leading-relaxed">
                  Include different conversation types - casual, serious, playful, deep.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[#FF7A00] font-medium">Stay Consistent:</div>
                <p className="text-blue-100/80 text-xs leading-relaxed">
                  Keep the voice consistent across examples to reinforce their style.
                </p>
              </div>
            </div>
          </Card>

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 pt-6 border-t border-gray-700/50">
            <Button
              onClick={onPrevious}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800/50 px-6 py-3 text-base order-2 sm:order-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            
            <Button
              onClick={handleNext}
              disabled={!isValid}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-8 py-3 text-base font-semibold order-1 sm:order-2"
            >
              Next: Finalize
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </FormProvider>
  );
};

export default DialogueStep;
