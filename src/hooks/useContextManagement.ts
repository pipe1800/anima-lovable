// Deprecated: useContextManagement has been removed.
// Keeping empty export for backward compatibility to avoid runtime errors
// if some stale build/import still references it. It now returns a no-op shape.
export const useContextManagement = () => ({
  context: {
    moodTracking: 'No context',
    clothingInventory: 'No context',
    locationTracking: 'No context',
    timeAndWeather: 'No context',
    relationshipStatus: 'No context',
    characterPosition: 'No context',
    enchantmentStatus: 'No context',
    itemInventory: 'No context'
  },
  reloadContext: () => {},
  isLoading: false
});
