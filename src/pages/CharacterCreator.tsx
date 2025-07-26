import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCharacterCreation } from '@/hooks/useCharacterCreation';
import { MobileNavMenu } from '@/components/layout/MobileNavMenu';
import { getUserCredits } from '@/lib/supabase-queries';
import { useToast } from '@/hooks/use-toast';
import { parseCharacterCard, parseExampleDialogue } from '@/lib/utils/characterCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TopBar } from '@/components/ui/TopBar';
import { 
  Loader2, Save, ArrowLeft, ArrowRight, Check, 
  User, Brain, MessageCircle, Rocket 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

// Lazy load heavy components for better performance
const FoundationStep = lazy(() => import('@/components/character-creator/FoundationStep'));
const PersonalityStep = lazy(() => import('@/components/character-creator/PersonalityStep'));
const DialogueStep = lazy(() => import('@/components/character-creator/DialogueStep'));
const FinalizeStep = lazy(() => import('@/components/character-creator/FinalizeStep'));

type Tag = Tables<'tags'>;

const STEPS = [
  { id: 1, title: 'Foundation', description: 'Basic details', icon: 'user' },
  { id: 2, title: 'Personality', description: 'Character traits', icon: 'brain' },
  { id: 3, title: 'Dialogue', description: 'Speech patterns', icon: 'message-circle' },
  { id: 4, title: 'Finalize', description: 'Review & launch', icon: 'rocket' }
];

// Add icon component
const StepIcon = ({ icon, className }: { icon: string; className?: string }) => {
  const icons: Record<string, JSX.Element> = {
    'user': <User className={className} />,
    'brain': <Brain className={className} />,
    'message-circle': <MessageCircle className={className} />,
    'rocket': <Rocket className={className} />
  };
  return icons[icon] || null;
};

const CharacterCreator = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const {
    currentStep,
    setCurrentStep,
    characterData,
    updateCharacterData,
    selectedTags,
    setSelectedTags,
    isCreating,
    isEditing,
    isDirty,
    saveCharacter,
    validateStep
  } = useCharacterCreation();

  const [userCredits, setUserCredits] = useState(0);
  const [isParsingCard, setIsParsingCard] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [exitDestination, setExitDestination] = useState<string>('/dashboard');

  // Fetch user credits for mobile nav
  useEffect(() => {
    const fetchCredits = async () => {
      if (!user) return;
      try {
        const creditsResult = await getUserCredits(user.id);
        if (creditsResult.data?.balance) {
          setUserCredits(creditsResult.data.balance);
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    };
    fetchCredits();
  }, [user]);

  // Handle unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Helper function to extract avatar from PNG
  const extractAvatarFromPNG = async (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (file: File) => {
    if (!file || file.type !== 'image/png') {
      toast({
        title: "Invalid File",
        description: "Please select a PNG character card file.",
        variant: "destructive",
      });
      return;
    }

    setIsParsingCard(true);
    
    try {
      const cardData = await parseCharacterCard(file);
      
      if (!cardData) {
        toast({
          title: "Failed to parse",
          description: "Could not read character data from the PNG file.",
          variant: "destructive",
        });
        return;
      }

      // Extract avatar from the PNG file
      const avatarUrl = await extractAvatarFromPNG(file);

      // Map card data to form structure with corrected field mapping
      const exampleDialogues = cardData.example_dialogues || 
        (cardData.mes_example ? parseExampleDialogue(cardData.mes_example) : []);

      updateCharacterData({
        name: cardData.name || '',
        avatar: avatarUrl || '', // Set the avatar from the PNG
        title: cardData.description || '', // Short description goes to title
        description: cardData.personality || '', // Main personality goes to description  
        personality: {
          core_personality: cardData.personality || '',
          tags: cardData.tags || [],
          knowledge_base: cardData.creator_notes || '',
          scenario_definition: cardData.scenario || ''
        },
        dialogue: {
          greeting: cardData.greeting || cardData.first_mes || '',
          example_dialogues: exampleDialogues
        }
      });

      toast({
        title: "Character Imported",
        description: "Character data has been imported successfully.",
      });
    } catch (error) {
      console.error('Error parsing character card:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import character data.",
        variant: "destructive",
      });
    } finally {
      setIsParsingCard(false);
    }
  };

  const handleStepChange = useCallback((step: number) => {
    // Validate current step before moving
    if (step > currentStep && !validateStep(currentStep)) {
      toast({
        title: "Incomplete Step",
        description: "Please complete all required fields before proceeding.",
        variant: "destructive",
      });
      return;
    }
    
    if (step >= 1 && step <= STEPS.length) {
      setCurrentStep(step);
    }
  }, [currentStep, validateStep, toast, setCurrentStep]);

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      handleStepChange(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleExit = useCallback((destination: string = '/dashboard') => {
    if (isDirty) {
      setExitDestination(destination);
      setShowExitDialog(true);
    } else {
      navigate(destination);
    }
  }, [isDirty, navigate]);

  const renderStep = () => {
    const stepProps = {
      data: characterData,
      onUpdate: updateCharacterData,
      onNext: handleNext,
      onPrevious: handlePrevious
    };

    switch (currentStep) {
      case 1:
        return (
          <FoundationStep
            {...stepProps}
            onFileChange={handleFileChange}
            isParsingCard={isParsingCard}
          />
        );
      case 2:
        return (
          <PersonalityStep
            {...stepProps}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />
        );
      case 3:
        return <DialogueStep {...stepProps} />;
      case 4:
        return (
          <FinalizeStep
            {...stepProps}
            onFinalize={saveCharacter}
            isCreating={isCreating}
            isEditing={isEditing}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />
        );
      default:
        return null;
    }
  };

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-[#121212] flex flex-col">
      {/* Header using standardized TopBar */}
      <TopBar
        title={isEditing ? 'Edit Character' : 'Create Character'}
        subtitle={STEPS[currentStep - 1].description}
        leftContent={
          <MobileNavMenu 
            userCredits={userCredits} 
            username={profile?.username || 'User'} 
            pageTitle=""
            onNavigate={handleExit}
          />
        }
        rightContent={
          isEditing ? (
            <Button
              onClick={saveCharacter}
              disabled={!isDirty || isCreating}
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Save Changes</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </Button>
          ) : null
        }
      >
        {/* Mobile Progress */}
        <div className="md:hidden space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">
              Step {currentStep} of {STEPS.length}
            </span>
            <span className="text-[#FF7A00] font-medium">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2 bg-gray-700" />
        </div>

        {/* Desktop Progress Steps */}
        <div className="hidden md:flex items-center justify-center space-x-2">
          {STEPS.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;

            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => handleStepChange(step.id)}
                  className={cn(
                    "flex items-center space-x-3 px-4 py-2 rounded-lg transition-all",
                    "hover:bg-gray-800/50",
                    isActive && "bg-[#FF7A00]/20 text-[#FF7A00]",
                    isCompleted && "text-green-400",
                    !isActive && !isCompleted && "text-gray-400"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    "transition-all duration-300",
                    isActive && "bg-[#FF7A00] text-white animate-pulse",
                    isCompleted && "bg-green-500 text-white",
                    !isActive && !isCompleted && "bg-gray-700"
                  )}>
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <StepIcon icon={step.icon} className="w-5 h-5" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-xs opacity-70">{step.description}</div>
                  </div>
                </button>
                
                {index < STEPS.length - 1 && (
                  <div className={cn(
                    "w-16 h-0.5 transition-all duration-300",
                    isCompleted ? "bg-green-500" : "bg-gray-700"
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </TopBar>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl">
          <Suspense fallback={
            <div className="flex items-center justify-center h-[60vh]">
              <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
            </div>
          }>
            {renderStep()}
          </Suspense>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden bg-[#1a1a2e] border-t border-gray-700/50 p-4 sticky bottom-0">
        <div className="flex items-center justify-between">
          <Button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-300"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex space-x-1">
            {STEPS.map((step) => (
              <button
                key={step.id}
                onClick={() => handleStepChange(step.id)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  step.id === currentStep ? "bg-[#FF7A00] w-6" : 
                  step.id < currentStep ? "bg-green-500" : "bg-gray-600"
                )}
              />
            ))}
          </div>

          {currentStep < STEPS.length ? (
            <Button
              onClick={handleNext}
              size="sm"
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={saveCharacter}
              disabled={isCreating}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="bg-[#1a1a2e] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Unsaved Changes</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300">
            You have unsaved changes. What would you like to do?
          </p>
          <div className="flex justify-end space-x-3 mt-4">
            <Button
              onClick={() => setShowExitDialog(false)}
              variant="outline"
              className="border-gray-600"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowExitDialog(false);
                navigate(exitDestination);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </Button>
            <Button
              onClick={() => {
                saveCharacter().then(() => {
                  setShowExitDialog(false);
                  navigate(exitDestination);
                });
              }}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Save & Exit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Loading Modal for PNG Character Card */}
      <Dialog open={isParsingCard} onOpenChange={() => {}}>
        <DialogContent className="bg-[#1a1a2e] border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF7A00]" />
              Importing Character
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-gray-300 mb-2">
              Reading character data from PNG file...
            </p>
            <p className="text-sm text-gray-500">
              This may take a moment
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CharacterCreator;
