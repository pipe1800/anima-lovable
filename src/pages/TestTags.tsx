import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Define the Tag type
interface Tag {
  id: number;
  name: string;
}

// Function to fetch tags from Supabase
const fetchTags = async (): Promise<Tag[]> => {
  console.log('Fetching tags...');
  const { data, error } = await supabase.from('tags').select('id, name').order('name');

  if (error) {
    console.error('Error fetching tags:', error);
    // Throwing an error here allows React Query to handle the error state
    throw new Error(error.message);
  }

  console.log('Fetched tags successfully:', data);
  return data || [];
};

const TestTags = () => {
  // Use React Query to fetch data
  const { data: allTags = [], isLoading, error } = useQuery<Tag[], Error>({
    queryKey: ['tags'],
    queryFn: fetchTags,
  });

  const [selectedTagId, setSelectedTagId] = React.useState<string>('');

  const handleTagSelect = (tagId: string) => {
    setSelectedTagId(tagId);
    const selectedTagObj = allTags.find(tag => tag.id.toString() === tagId);
    console.log('Selected tag:', selectedTagObj);
  };

  return (
    <div className="min-h-screen bg-[#121212] p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Test Tags Page</h1>
        
        <div className="space-y-6">
          {/* Status Display */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-white font-semibold mb-2">Status:</h2>
            <p className="text-gray-300">Loading: {isLoading ? 'Yes' : 'No'}</p>
            <p className="text-gray-300">Tags Count: {allTags.length}</p>
            {error && (
              <p className="text-red-400">Error: {error.message}</p>
            )}
          </div>

          {/* Dropdown Test */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-white font-semibold mb-4">Dropdown Test:</h2>
            <Select onValueChange={handleTagSelect} value={selectedTagId} disabled={isLoading || allTags.length === 0}>
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                <SelectValue placeholder={isLoading ? 'Loading tags...' : 'Select a tag...'} />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                {allTags.length > 0 ? (
                  allTags.map((tag) => (
                    <SelectItem
                      key={tag.id}
                      value={tag.id.toString()}
                      className="text-white hover:bg-gray-600 focus:bg-gray-600"
                    >
                      {tag.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-tags" disabled className="text-gray-400">
                    {isLoading ? 'Loading...' : (error ? 'Error loading tags' : 'No tags found')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestTags;