import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MobileNavMenu } from '@/components/layout/MobileNavMenu';
import { getUserCredits } from '@/lib/supabase-queries';
import FoundationStep from '@/components/character-creator/FoundationStep';
import PersonalityStep from '@/components/character-creator/PersonalityStep';
import DialogueStep from '@/components/character-creator/DialogueStep';

import FinalizeStep from '@/components/character-creator/FinalizeStep';
import CreationStepsHeader from '@/components/character-creator/CreationStepsHeader';
import { createCharacter, updateCharacter, type CharacterCreationData } from '@/lib/character-operations';
import { getCharacterDetails } from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseCharacterCard, parseExampleDialogue, type CharacterCardData } from '@/lib/utils/characterCard';
import type { Tables } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

type Tag = Tables<'tags'>;

const CharacterCreator = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [characterData, setCharacterData] = useState<any>({
    name: '',
    avatar: '',
    title: '',
    description: '',
    personality: {
      core_personality: '',
      tags: [],
      knowledge_base: '',
      scenario_definition: ''
    },
    dialogue: {
      greeting: '',
      example_dialogues: []
    },
    addons: {
      dynamicWorldInfo: false,
      enhancedMemory: false,
      moodTracking: false,
      clothingInventory: false,
      locationTracking: false,
      timeAndWeather: false,
      relationshipStatus: false,
      chainOfThought: false,
      fewShotExamples: false
    },
    visibility: 'public',
    nsfw_enabled: false
  });
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingCard, setIsParsingCard] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [userCredits, setUserCredits] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  // Fetch user credits for mobile nav
  useEffect(() => {
    const fetchCredits = async () => {
      if (!user) return;
      try {
        const creditsResult = await getUserCredits(user.id);
        if (creditsResult.data && typeof creditsResult.data.balance === 'number') {
          setUserCredits(creditsResult.data.balance);
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    };
    fetchCredits();
  }, [user]);

  // Check if we're editing a character from location state
  useEffect(() => {
    const state = location.state as any;
    if (state?.isEditing && state?.editingCharacter) {
      setIsEditing(true);
      setEditingCharacterId(state.editingCharacter.id);
      loadCharacterForEditing(state.editingCharacter.id);
    }
  }, [location.state]);

  const loadCharacterForEditing = async (characterId: string) => {
    try {
      const { data: character, error } = await getCharacterDetails(characterId);
      if (error || !character) {
        toast({
          title: "Error Loading Character",
          description: "Failed to load character data for editing.",
          variant: "destructive",
        });
        return;
      }

      // Parse the definition JSON to extract personality and dialogue data
      let definitionData: {
        title?: string;
        personality?: {
          tags?: string[];
          knowledge_base?: string;
          scenario_definition?: string;
        };
        dialogue?: {
          example_dialogues?: Array<{
            user: string;
            character: string;
          }>;
        };
        addons?: {
          dynamicWorldInfo?: boolean;
          enhancedMemory?: boolean;
          moodTracking?: boolean;
          clothingInventory?: boolean;
          locationTracking?: boolean;
          timeAndWeather?: boolean;
          relationshipStatus?: boolean;
          chainOfThought?: boolean;
          fewShotExamples?: boolean;
        };
      } = {};

      if (character.definition?.[0]?.personality_summary) {
        try {
          definitionData = JSON.parse(character.definition[0].personality_summary);
        } catch (e) {
          console.error('Error parsing character definition:', e);
        }
      }

      // Determine if addons are enabled based on whether addons object exists and has enabled addons
      const hasAddonsData = definitionData.addons && Object.values(definitionData.addons).some(value => value === true);

      setCharacterData({
        name: character.name,
        avatar: character.avatar_url || '',
        title: definitionData.title || '',
        description: character.short_description || '',
        personality: {
          core_personality: character.definition?.[0]?.description || '',
          tags: definitionData.personality?.tags || [],
          knowledge_base: definitionData.personality?.knowledge_base || '',
          scenario_definition: definitionData.personality?.scenario_definition || ''
        },
        dialogue: {
          greeting: character.definition?.[0]?.greeting || '',
          example_dialogues: definitionData.dialogue?.example_dialogues || []
        },
        addons: hasAddonsData ? {
          dynamicWorldInfo: definitionData.addons?.dynamicWorldInfo || false,
          enhancedMemory: definitionData.addons?.enhancedMemory || false,
          moodTracking: definitionData.addons?.moodTracking || false,
          clothingInventory: definitionData.addons?.clothingInventory || false,
          locationTracking: definitionData.addons?.locationTracking || false,
          timeAndWeather: definitionData.addons?.timeAndWeather || false,
          relationshipStatus: definitionData.addons?.relationshipStatus || false,
          chainOfThought: definitionData.addons?.chainOfThought || false,
          fewShotExamples: definitionData.addons?.fewShotExamples || false
        } : {
          // If no addons data exists, initialize all to false
          dynamicWorldInfo: false,
          enhancedMemory: false,
          moodTracking: false,
          clothingInventory: false,
          locationTracking: false,
          timeAndWeather: false,
          relationshipStatus: false,
          chainOfThought: false,
          fewShotExamples: false
        },
        visibility: character.visibility as 'public' | 'unlisted' | 'private',
        nsfw_enabled: false // This would need to be stored in the database if needed
      });
    } catch (error) {
      console.error('Error loading character for editing:', error);
      toast({
        title: "Error Loading Character",
        description: "Failed to load character data for editing.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;

    try {
      setIsParsingCard(true);
      
      toast({
        title: "Parsing Character Card",
        description: "Reading character data from PNG file...",
      });

      const cardData = await parseCharacterCard(file);
      
      if (!cardData) {
        toast({
          title: "Failed to load character card",
          description: "Could not parse character data from the PNG file. Please ensure it's a valid character card.",
          variant: "destructive",
        });
        setIsParsingCard(false);
        return;
      }

      // Upload the PNG file to Supabase storage for the avatar
      let avatarUrl = '';
      if (user) {
        try {
          const fileExt = 'png';
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('character-avatars')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Error uploading avatar:', uploadError);
            toast({
              title: "Avatar Upload Warning",
              description: "Character data was imported but avatar upload failed.",
              variant: "destructive",
            });
          } else {
            // Get the public URL for the uploaded file
            const { data: urlData } = supabase.storage
              .from('character-avatars')
              .getPublicUrl(fileName);
            
            avatarUrl = urlData.publicUrl;
          }
        } catch (error) {
          console.error('Error uploading avatar:', error);
          toast({
            title: "Avatar Upload Warning",
            description: "Character data was imported but avatar upload failed.",
            variant: "destructive",
          });
        }
      }

      // Parse example dialogue from mes_example field (standard character card format)
      let processedExampleDialogue = [];
      if (cardData.mes_example) {
        console.log('Processing mes_example:', cardData.mes_example);
        processedExampleDialogue = parseExampleDialogue(cardData.mes_example);
      }
      console.log('Processed example dialogues:', processedExampleDialogue);

      // Map character card data to our form structure with proper field names
      console.log('Mapping character card data:', cardData);
      const mappedData = {
        name: cardData.name || cardData.char_name || '',
        avatar: avatarUrl, // Use the uploaded PNG as avatar
        title: cardData.title || '',
        description: cardData.personality || cardData.char_persona || '',
        personality: {
          core_personality: cardData.description || cardData.char_persona || '',
          tags: [], // Tags will be handled separately if needed
          knowledge_base: cardData.scenario || '',
          scenario_definition: cardData.scenario || ''
        },
        dialogue: {
          greeting: cardData.first_mes || '',
          example_dialogues: processedExampleDialogue
        },
        addons: {
          dynamicWorldInfo: false,
          enhancedMemory: false,
          moodTracking: false,
          clothingInventory: false,
          locationTracking: false,
          timeAndWeather: false,
          relationshipStatus: false,
          chainOfThought: false,
          fewShotExamples: false
        },
        visibility: characterData.visibility, // Keep current visibility setting
        nsfw_enabled: characterData.nsfw_enabled // Keep current NSFW setting
      };

      // Update the character data with the fully structured data
      console.log('Setting character data:', mappedData);
      setCharacterData(mappedData);

      toast({
        title: "Character Card Loaded!",
        description: `Successfully imported character "${cardData.name || cardData.char_name || 'Unknown'}" with avatar and content.`,
      });

    } catch (error) {
      console.error('Error parsing character card:', error);
      toast({
        title: "Parse Error",
        description: error instanceof Error ? error.message : "Failed to parse character card.",
        variant: "destructive",
      });
    } finally {
      setIsParsingCard(false);
    }
  };


  const steps = [
    { id: 1, title: 'Foundation', description: 'Basic character info' },
    { id: 2, title: 'Personality', description: 'Traits and behavior' },
    { id: 3, title: 'Dialogue', description: 'Voice and responses' },
    { id: 4, title: 'Finalize', description: isEditing ? 'Review and update' : 'Review and create' }
  ];

  const handleStepChange = (stepId: number) => {
    setCurrentStep(stepId);
  };

  const handleDataUpdate = (stepData: any) => {
    setCharacterData(prev => ({
      ...prev,
      ...stepData
    }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinalize = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to create a character.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreating(true);
      
      // Validate required fields
      if (!characterData.name || !characterData.description || !characterData.personality?.core_personality || !characterData.dialogue?.greeting) {
        toast({
          title: "Missing Information",
          description: "Please fill in all required fields.",
          variant: "destructive",
        });
        return;
      }

      let character;
      if (isEditing && editingCharacterId) {
        character = await updateCharacter(editingCharacterId, characterData as CharacterCreationData);
        toast({
          title: "Character Updated!",
          description: `${character.name} has been successfully updated.`,
        });
      } else {
        character = await createCharacter(characterData as CharacterCreationData);
        toast({
          title: "Character Created!",
          description: `${character.name} has been successfully created.`,
        });
      }
      
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving character:', error);
      toast({
        title: isEditing ? "Update Failed" : "Creation Failed",
        description: `Failed to ${isEditing ? 'update' : 'create'} character. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <FoundationStep
            data={characterData}
            onUpdate={handleDataUpdate}
            onNext={handleNext}
            onFileChange={handleFileChange}
            isParsingCard={isParsingCard}
          />
        );
      case 2:
        return (
          <PersonalityStep
            data={characterData}
            onUpdate={handleDataUpdate}
            onNext={handleNext}
            onPrevious={handlePrevious}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />
        );
      case 3:
        return (
          <DialogueStep
            data={characterData}
            onUpdate={handleDataUpdate}
            onNext={handleNext}
            onPrevious={handlePrevious}
          />
        );
      case 4:
        return (
          <FinalizeStep
            data={characterData}
            onUpdate={handleDataUpdate}
            onFinalize={handleFinalize}
            onPrevious={handlePrevious}
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
    <div className="flex flex-col h-screen bg-[#121212]">
      {/* Mobile Navigation */}
      <div className="md:hidden bg-[#1b1b1b] border-b border-gray-700/50 p-4">
        <div className="flex items-center justify-between">
          <MobileNavMenu 
            userCredits={userCredits} 
            username={profile?.username || 'User'} 
            pageTitle={isEditing ? 'Edit Character' : 'Create Character'}
          />
          <div className="flex-1">
            <h1 className="text-white text-lg font-semibold text-center">
              {isEditing ? 'Edit Character' : 'Create Character'}
            </h1>
          </div>
          <div className="w-16"></div> {/* Spacer for centering */}
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex flex-col h-full">
        <div className="w-full">
          <CreationStepsHeader
            steps={steps}
            currentStep={currentStep}
            onStepChange={handleStepChange}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {renderCurrentStep()}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden">
        <div className="bg-[#1b1b1b] border-b border-gray-700/50">
          <CreationStepsHeader
            steps={steps}
            currentStep={currentStep}
            onStepChange={handleStepChange}
          />
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          {renderCurrentStep()}
        </div>
      </div>

      {/* Loading Modal for PNG Character Card */}
      <Dialog open={isParsingCard} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF7A00]" />
              Reading Character Card
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            <div className="text-center">
              <p className="text-gray-400 mb-2">
                Extracting character information from your PNG file...
              </p>
              <p className="text-sm text-gray-500">
                This may take a moment
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CharacterCreator;
