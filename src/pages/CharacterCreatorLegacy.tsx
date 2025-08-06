import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCharacterCreation } from '@/hooks/useCharacterCreation';
import { MobileNavMenu } from '@/components/layout/MobileNavMenu';
import { getUserCredits } from '@/lib/supabase-queries';
import { useToast } from '@/hooks/use-toast';
import { parseCharacterCard } from '@/lib/utils/characterCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Save, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lazy load heavy components
const FoundationStep = lazy(() => import('@/components/character-creator/FoundationStep'));
const PersonalityStep = lazy(() => import('@/components/character-creator/PersonalityStep'));
const DialogueStep = lazy(() => import('@/components/character-creator/DialogueStep'));
const FinalizeStep = lazy(() => import('@/components/character-creator/FinalizeStep'));

const STEPS = [
  { id: 1, title: 'Foundation', description: 'Basic details' },
  { id: 2, title: 'Personality', description: 'Character traits' },
  { id: 3, title: 'Dialogue', description: 'Speech patterns' },
  { id: 4, title: 'Finalize', description: 'Review & launch' }
];

export default function CharacterCreator() {
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
    saveCharacter
  } = useCharacterCreation();

  const [userCredits, setUserCredits] = useState(0);
  const [isParsingCard, setIsParsingCard] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Fetch user credits
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

  // Handle unsaved changes
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

      // Map card data to form structure
      updateCharacterData({
        name: cardData.name || '',
        title: cardData.tagline || '',
        description: cardData.description || '',
        personality: {
          core_personality: cardData.personality || '',
          tags: cardData.tags || [],
          knowledge_base: '',
          scenario_definition: cardData.scenario || ''
        },
        dialogue: {
          greeting: cardData.greeting || cardData.first_mes || '',
          example_dialogues: cardData.example_dialogues || []
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

  const handleStepChange = (step: number) => {
    if (step >= 1 && step <= STEPS.length) {
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleExit = () => {
    if (isDirty) {
      setShowExitDialog(true);
    } else {
      navigate('/dashboard');
    }
  };

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

  return (
    <div className="min-h-screen bg-[#121212] flex flex-col">
      {/* Mobile Header */}
      <div className="md:hidden bg-[#1a1a2e] border-b border-gray-700/50 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <MobileNavMenu 
            userCredits={userCredits} 
            username={profile?.username || 'User'} 
            pageTitle={isEditing ? 'Edit Character' : 'Create Character'}
          />
          
          {isDirty && (
            <Button
              onClick={saveCharacter}
              disabled={isCreating}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
          )}
        </div>

        {/* Mobile Progress Bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">
              Step {currentStep} of {STEPS.length}
            </span>
            <span className="text-xs text-[#FF7A00] font-medium">
              {Math.round((currentStep / STEPS.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden md:block bg-[#1a1a2e] border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleExit}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {isEditing ? 'Edit Character' : 'Create Character'}
                </h1>
                <p className="text-gray-400 text-sm">
                  {STEPS[currentStep - 1].description}
                </p>
              </div>
            </div>

            {isDirty && (
              <Button
                onClick={saveCharacter}
                disabled={isCreating}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Desktop Progress Steps */}
          <div className="flex items-center justify-center mt-6 space-x-2">
            {STEPS.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;

              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => handleStepChange(step.id)}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-lg transition-all",
                      isActive && "bg-[#FF7A00]/20 text-[#FF7A00]",
                      isCompleted && "text-green-400 hover:bg-green-400/10",
                      !isActive && !isCompleted && "text-gray-400 hover:bg-gray-700/50"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      isActive && "bg-[#FF7A00] text-white",
                      isCompleted && "bg-green-500 text-white",
                      !isActive && !isCompleted && "bg-gray-700 text-gray-400"
                    )}>
                      {isCompleted ? '✓' : step.id}
                    </div>
                    <span className="hidden lg:inline font-medium">{step.title}</span>
                  </button>
                  
                  {index < STEPS.length - 1 && (
                    <div className={cn(
                      "w-8 h-0.5",
                      isCompleted ? "bg-green-500" : "bg-gray-700"
                    )} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
          </div>
        }>
          {renderStep()}
        </Suspense>
      </div>

      {/* Mobile Navigation */}
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
              <div
                key={step.id}
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
            You have unsaved changes. Are you sure you want to leave?
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
              onClick={() => navigate('/dashboard')}
              className="bg-red-600 hover:bg-red-700"
            >
              Leave without saving
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
              Importing Character Card
            </DialogTitle>
          </DialogHeader>
          <p className="text-gray-300">
            Reading character data from PNG file...
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
