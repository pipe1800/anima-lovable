# Context Tracking Issue - Comprehensive Testing Plan

## Issues Found and Fixed:

### 1. **PRIMARY ISSUE: Key Format Mismatch**
- **Problem**: Edge function saves as `{mood: "happy"}`, frontend expects `{moodTracking: "happy"}`
- **Fix**: Added conversion utility `convertDatabaseContextToTrackedContext()` 
- **Files**: `/workspaces/anima/src/utils/contextConverter.ts`

### 2. **SECONDARY ISSUE: Database Query Mismatch**  
- **Problem**: `fetchCurrentContext` queried wrong table (`user_chat_context` vs `chat_context`)
- **Fix**: Updated to query correct table and convert format
- **Files**: `/workspaces/anima/supabase/functions/chat-management/modules/database.ts`

### 3. **TERTIARY ISSUE: Message Context Not Converted**
- **Problem**: Messages loaded with raw database format context
- **Fix**: Added context conversion in query processing
- **Files**: `/workspaces/anima/src/queries/chatQueries.ts`

### 4. **QUATERNARY ISSUE: Frontend Context Loading**
- **Problem**: `useContextManagement` didn't convert database format
- **Fix**: Use conversion utility in context loading
- **Files**: `/workspaces/anima/src/hooks/useContextManagement.ts`

### 5. **QUINARY ISSUE: Display Component Compatibility**
- **Problem**: ContextDisplay had partial format handling
- **Fix**: Improved to handle all possible format combinations
- **Files**: `/workspaces/anima/src/components/chat/ContextDisplay.tsx`

## Testing Checklist:

### Phase 1: Database Verification
- [ ] Run `debug_context.sql` to verify context is being saved
- [ ] Check that `chat_context` table has records with proper `current_context` JSONB
- [ ] Verify context format is `{mood: "value", clothing: "value", ...}`

### Phase 2: Edge Function Testing
- [ ] Send a chat message with addons enabled
- [ ] Check browser DevTools console for context extraction logs
- [ ] Verify context is saved to `chat_context` table
- [ ] Check that message has `current_context` field populated

### Phase 3: Frontend Loading Testing
- [ ] Refresh chat page and check `useContextManagement` logs
- [ ] Verify conversion from database format to frontend format
- [ ] Check that context dropdown shows actual values instead of "No context yet"

### Phase 4: Message Display Testing
- [ ] Verify that message context is converted correctly in chat queries
- [ ] Check that ContextDisplay receives proper format
- [ ] Confirm dropdown shows: "Mood Tracking: happy" instead of "Mood Tracking: No context yet"

### Phase 5: Settings Verification
- [ ] Ensure global chat settings are enabled for context addons
- [ ] Verify settings mapping from snake_case to camelCase
- [ ] Check that addon settings are passed correctly to edge function

## Quick Debug Commands:

### Browser Console:
```javascript
// Check if context is loaded
console.log('Context from useContextManagement:', /* check context state */);

// Check message format
console.log('Message context format:', /* check message.current_context */);
```

### Supabase Logs:
```bash
# Check edge function logs for context extraction
supabase functions logs chat-management --follow
```

### Database Queries:
```sql
-- Check latest context
SELECT cc.current_context FROM chat_context cc ORDER BY cc.updated_at DESC LIMIT 1;

-- Check user settings
SELECT * FROM user_global_chat_settings WHERE user_id = 'your-user-id';
```

## Expected Results After Fix:

### Before:
```
Mood Tracking: No context yet
Clothing Inventory: No context yet  
Location Tracking: No context yet
```

### After:
```
Mood Tracking: Happy and excited
Clothing Inventory: Red evening dress
Location Tracking: Cozy bedroom
```

## Rollback Plan (if needed):
1. Revert `/workspaces/anima/src/utils/contextConverter.ts`
2. Revert changes to `/workspaces/anima/src/queries/chatQueries.ts`
3. Revert changes to `/workspaces/anima/src/hooks/useContextManagement.ts`
4. Revert changes to database.ts in edge function
5. Revert changes to ContextDisplay.tsx
