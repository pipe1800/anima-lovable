# Debug Message Counter Implementation

## Overview
Successfully added message counting and auto-summarization status tracking to the existing debug panel in the Anima chat interface.

## Implementation Details

### Files Modified
1. **`/src/components/debug/AddonDebugPanel.tsx`**
   - Added `chatId` prop to interface
   - Added `messageStats` state for tracking message counts
   - Added effect to fetch message statistics from database
   - Added new purple-themed debug section for message counter display

2. **`/src/components/chat/ChatInterface.tsx`**
   - Updated AddonDebugPanel props to include `currentChatId`

### Features Added

#### Message Statistics Panel
- **Total Messages**: Shows total message count in current chat
- **AI Messages**: Shows count of AI responses (used for auto-summary triggering)
- **Last Summary At Message**: Shows the message number where the last auto-summary was created
- **Next Summary At Message**: Shows when the next auto-summary will trigger
- **Messages Until Summary**: Shows countdown to next auto-summary

#### Database Integration
- Correctly queries `messages` table using `is_ai_message` column
- Queries `character_memories` table with `is_auto_summary` filter
- Handles chat ID routing properly from ChatInterface to debug panel

#### Auto-Summary Logic Display
- Shows every 15 AI responses trigger
- Displays current progress toward next summary
- Shows last summary creation point
- Provides explanation of the auto-summary system

### Design Consistency
- Follows existing debug panel styling (purple theme for message stats)
- Uses same icon pattern (MessageCircle icon)
- Maintains responsive layout with proper spacing
- Only shows when `chatId` is available and debug mode is enabled

### Database Schema Compatibility
- **Messages table**: `is_ai_message` boolean column
- **Character_memories table**: `message_count`, `is_auto_summary` columns
- Proper error handling for database queries

## How It Works

1. **State Management**: Uses React hooks to track message statistics
2. **Database Queries**: Fetches real-time data from Supabase on component mount
3. **Conditional Rendering**: Only shows message stats section when chat is active
4. **Auto-refresh**: Updates when chatId changes (new chat selected)

## User Experience
- Developers can now monitor the message-based auto-summary system in real-time
- Clear visibility into when auto-summaries will trigger
- Debug information helps with testing and troubleshooting
- Non-intrusive - only shows in development mode

## Next Auto-Summary Trigger Logic
```typescript
const nextSummaryAt = Math.ceil((aiMessages + 1) / 15) * 15;
```

This ensures summaries trigger at messages 15, 30, 45, 60, etc. based on AI message count.
