# World Info Components

This directory contains all components related to World Info functionality, organized and cleaned up for maintainability.

## Components

### 📄 `WorldInfoPage.tsx`
**Main listing page for World Info**
- Displays both public and user's world info
- Includes search, filtering, and sorting functionality
- Handles file import/export
- Mobile-responsive design
- Used in route: `/world-info`

### ✏️ `WorldInfoEditor.tsx`
**Editor for creating and editing World Info**
- Unified component for both create and edit modes
- Two-tab interface: Basic Info and Entries
- Real-time entry management
- Tag system integration
- Used in routes: `/world-info/create` and `/world-info/:id/edit`

### 🔗 `WorldInfoEditorWrapper.tsx`
**Simple wrapper for edit mode**
- Extracts ID from URL params
- Passes to WorldInfoEditor in edit mode
- Keeps routing clean and simple

### 🎴 `WorldInfoCard.tsx`
**Card component for displaying World Info items**
- Standardized design across the app
- Supports owner vs public view modes
- Includes action buttons (edit, delete, etc.)
- Responsive grid layout
- Used by WorldInfoPage

## Removed Components (Cleanup)

### Deleted Files:
- ❌ `ImprovedWorldInfoPage.tsx` → Renamed to `WorldInfoPage.tsx`
- ❌ `StandardizedWorldInfoCard.tsx` → Renamed to `WorldInfoCard.tsx`
- ❌ `UnifiedWorldInfoEditor.tsx` → Renamed to `WorldInfoEditor.tsx`
- ❌ `UnifiedWorldInfoEditorWrapper.tsx` → Renamed to `WorldInfoEditorWrapper.tsx`
- ❌ `WorldInfoEditor.tsx` (old duplicate)
- ❌ `WorldInfoBasicForm.tsx` (duplicate functionality)
- ❌ `WorldInfoEntries.tsx` (duplicate functionality)
- ❌ `MobileNavigation.tsx` → Moved to `src/components/ui/navigation/`
- ❌ `src/pages/WorldInfo.tsx` (duplicate page)
- ❌ `src/pages/WorldInfoEditor.tsx` (duplicate page)
- ❌ `src/pages/WorldInfoEdit.tsx` (duplicate page)

## Directory Structure

```
src/components/world-info/
├── index.ts                    # Export barrel
├── README.md                   # This file
├── WorldInfoPage.tsx           # Main listing page
├── WorldInfoEditor.tsx         # Create/edit editor
├── WorldInfoEditorWrapper.tsx  # Edit mode wrapper
└── WorldInfoCard.tsx           # Display card component
```

## Routes

- `/world-info` → `WorldInfoPage`
- `/world-info/create` → `WorldInfoEditor` (mode="create")
- `/world-info/:id/edit` → `WorldInfoEditorWrapper` → `WorldInfoEditor` (mode="edit")

## Key Features

✅ **Unified Architecture**: Single editor component handles both create and edit modes  
✅ **Clean Naming**: Removed "Improved", "Unified", "Standardized" prefixes  
✅ **No Duplication**: Eliminated duplicate components and pages  
✅ **Proper Organization**: Components are logically grouped and exported  
✅ **Mobile Responsive**: All components work on mobile and desktop  
✅ **Type Safety**: Proper TypeScript interfaces throughout

## Dependencies

- React Router for navigation
- React Query for data fetching
- Tailwind CSS for styling
- Lucide React for icons
- Supabase for backend operations

## Related Hooks

- `useUserWorldInfos()` - Fetch user's world info
- `usePublicWorldInfos()` - Fetch public world info
- `useWorldInfoWithEntries()` - Fetch world info with entries
- `useAllTags()` - Fetch available tags

## Related Operations

- `createWorldInfo()` - Create new world info
- `updateWorldInfo()` - Update existing world info
- `addWorldInfoEntry()` - Add new entry
- `updateWorldInfoEntry()` - Update entry
- `deleteWorldInfoEntry()` - Delete entry
- `addWorldInfoTag()` / `removeWorldInfoTag()` - Tag management
