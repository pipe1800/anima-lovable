import React, { useState, useEffect } from 'react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filterBy: string;
  setFilterBy: (filter: string) => void;
  onFiltersApplied: (filters: {
    tags: string[];
    creator: string;
    nsfw: boolean;
    gender: string;
  }) => void;
}

export function FilterPanel({ isOpen, onClose, filterBy, setFilterBy, onFiltersApplied }: FilterPanelProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showNSFW, setShowNSFW] = useState(false);
  const [characterGender, setCharacterGender] = useState('any');
  const [creatorSearch, setCreatorSearch] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch actual tags from database
  useEffect(() => {
    const fetchTags = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tags')
          .select('name')
          .order('name');
        
        if (data && !error) {
          setAvailableTags(data.map(tag => tag.name));
        } else {
          // Fallback to hardcoded tags if database query fails
          setAvailableTags([
            'Action', 'Adventure', 'Anime', 'Comedy', 'Drama', 'Fantasy',
            'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Thriller',
            'Animals', 'Assistant', 'Historical', 'OC', 'Games', 'RPG',
            'Storytelling', 'Female', 'Furry', 'Male', 'Non-binary', 'NSFW',
            'Multiple Character'
          ]);
        }
      } catch (error) {
        console.error('Error fetching tags:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  const filteredTags = availableTags.filter(tag =>
    tag.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleApplyFilters = () => {
    // Apply all filters via callback
    onFiltersApplied({
      tags: selectedTags,
      creator: creatorSearch,
      nsfw: showNSFW,
      gender: characterGender
    });
    onClose();
  };

  const handleClearAll = () => {
    setSelectedTags([]);
    setTagSearch('');
    setShowNSFW(false);
    setCharacterGender('any');
    setCreatorSearch('');
    setFilterBy('all');
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-[400px] sm:w-[500px] bg-[#1a1a2e] border-l border-gray-700/50 overflow-y-auto"
      >
        <SheetHeader className="border-b border-gray-700/50 pb-6">
          <SheetTitle className="text-2xl text-white font-bold">Advanced Filters</SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-8">
          {/* Filter by Tags Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Filter by Tags</h3>
            
            {/* Tag Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search tags..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="pl-10 bg-[#121212] border-gray-600/50 text-white placeholder-gray-400 focus:border-[#FF7A00]"
              />
            </div>

            {/* Tags Grid */}
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {filteredTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedTags.includes(tag)
                      ? 'bg-[#FF7A00] text-white'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Selected Tags Display */}
            {selectedTags.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Selected tags:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 bg-[#FF7A00]/20 text-[#FF7A00] text-xs rounded-full border border-[#FF7A00]/30"
                    >
                      {tag}
                      <button
                        onClick={() => toggleTag(tag)}
                        className="ml-1 hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* NSFW Content Toggle */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Content Rating</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="nsfw-toggle" className="text-gray-300">Show NSFW Content</Label>
              <Switch
                id="nsfw-toggle"
                checked={showNSFW}
                onCheckedChange={setShowNSFW}
                className="data-[state=checked]:bg-[#FF7A00]"
              />
            </div>
          </div>

          {/* Character Gender */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Character Gender</h3>
            <RadioGroup value={characterGender} onValueChange={setCharacterGender}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="any" id="any" className="text-[#FF7A00] border-gray-600" />
                <Label htmlFor="any" className="text-gray-300">Any</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" className="text-[#FF7A00] border-gray-600" />
                <Label htmlFor="male" className="text-gray-300">Male</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" className="text-[#FF7A00] border-gray-600" />
                <Label htmlFor="female" className="text-gray-300">Female</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nonbinary" id="nonbinary" className="text-[#FF7A00] border-gray-600" />
                <Label htmlFor="nonbinary" className="text-gray-300">Non-binary</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Creator Search */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Creator</h3>
            <Input
              placeholder="Search by creator handle..."
              value={creatorSearch}
              onChange={(e) => setCreatorSearch(e.target.value)}
              className="bg-[#121212] border-gray-600/50 text-white placeholder-gray-400 focus:border-[#FF7A00]"
            />
          </div>
        </div>

        <SheetFooter className="border-t border-gray-700/50 pt-6 flex-col space-y-3">
          <Button
            onClick={handleApplyFilters}
            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-semibold py-3"
          >
            Apply Filters
          </Button>
          <button
            onClick={handleClearAll}
            className="w-full text-gray-400 hover:text-[#FF7A00] transition-colors text-sm font-medium"
          >
            Clear All
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
