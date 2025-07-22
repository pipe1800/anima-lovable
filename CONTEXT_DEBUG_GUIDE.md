# Context Tracking Debug Guide

## Overview
This guide helps debug context tracking issues in the Anima chat system.

## Quick Debugging Steps

### 1. Browser Console Commands

Open browser console and run these commands:

```javascript
// Test context loading for current chat
// Get chatId from URL or browser state
const pathParts = window.location.pathname.split('/');
const chatId = pathParts[pathParts.length - 1];
const characterId = pathParts[pathParts.length - 2];

// You'll need to get userId from auth state
console.log('Chat ID:', chatId);
console.log('Character ID:', characterId);

// Test the context loading function (available in dev mode)
if (window.testContextLoading) {
  window.testContextLoading(chatId, 'user-id-here', characterId);
}
```

### 2. Check React Dev Tools

1. Install React Developer Tools browser extension
2. Go to Components tab
3. Search for "ContextDisplay" component
4. Check props:
   - `currentContext` - should contain context data
   - `addonSettings` - should show enabled features
   - `contextUpdates` - should show historical changes

### 3. Check Console Logs

Look for these log patterns:

#### Good Logs (Context Working):
```
🔍 ContextDisplay received props: {...}
✅ Raw context from database: {...}
✅ Converted context for frontend: {...}
🎯 Using tracked context from database: {...}
```

#### Problem Logs (Context Not Working):
```
❌ RPC error or no context found: {...}
⚠️ Context conversion failed
🚫 Missing required params for context loading
```

### 4. Database Direct Check

If you have database access, run:

```sql
-- Check if context exists for your chat
SELECT * FROM chat_context WHERE chat_id = 'your-chat-id';

-- Check if RPC function exists
SELECT proname FROM pg_proc WHERE proname = 'get_chat_context';
```

### 5. Network Tab Check

1. Open Network tab in dev tools
2. Look for calls to `chat-management` edge function
3. Check if context is being saved after AI responses
4. Look for RPC calls to `get_chat_context`

## Common Issues and Fixes

### Issue 1: "No context yet" shown despite context existing

**Cause**: Context not loading from database properly

**Fix**:
1. Check console for RPC errors
2. Verify user authentication
3. Check if chat_context table has records

### Issue 2: Context not updating after AI responses

**Cause**: Backend not saving context updates

**Fix**:
1. Check Network tab for chat-management calls
2. Verify addon settings are enabled
3. Check backend logs for context extraction errors

### Issue 3: Context shows but disappears on reload

**Cause**: Context not persisting to database

**Fix**:
1. Check database permissions
2. Verify RPC function permissions
3. Check if context is being saved properly

## Implementation Details

The context flows through these components:

1. **Backend**: AI responses extract context → saved to `chat_context` table
2. **useContextManagement**: Loads context from database via RPC
3. **Chat.tsx**: Syncs loaded context to local state
4. **ChatInterface**: Uses context from unified hook
5. **ChatMessages**: Passes context to MessageGroup
6. **MessageGroup**: Passes context to ContextDisplay
7. **ContextDisplay**: Renders context UI

## Recent Changes Made

1. ✅ Fixed `useContextManagement` hook to better handle errors
2. ✅ Updated context prioritization in `ChatMessages`
3. ✅ Added comprehensive debugging logs
4. ✅ Created test utility for browser console debugging
5. ✅ Fixed context field name mapping issues

## Next Steps

If context still not working:
1. Run the test utility in browser console
2. Check all console logs patterns
3. Verify database has context records
4. Check addon settings are enabled
5. Verify user authentication is working
