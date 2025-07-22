/**
 * CONTEXT TRACKING VERIFICATION SCRIPT
 * 
 * Run this in the browser console to check if context data is flowing correctly
 */

// Function to check context data flow
function verifyContextTracking() {
  console.log('🔍 CONTEXT TRACKING VERIFICATION');
  console.log('================================');
  
  // 1. Check if context data exists in localStorage/sessionStorage
  const chatId = window.location.pathname.split('/').pop();
  console.log('📍 Current Chat ID:', chatId);
  
  // 2. Check useContextManagement state (if available)
  // This would need to be checked manually in React DevTools
  console.log('📋 Check useContextManagement in React DevTools');
  
  // 3. Check if ContextDisplay components exist in DOM
  const contextDisplays = document.querySelectorAll('[class*="ContextDisplay"]');
  console.log('🎨 ContextDisplay components found:', contextDisplays.length);
  
  // 4. Check for "Context" buttons/dropdowns
  const contextButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
    btn.textContent?.includes('Context')
  );
  console.log('🔘 Context buttons found:', contextButtons.length, contextButtons);
  
  // 5. Check for "No context yet" text
  const noContextElements = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent?.includes('No context yet')
  );
  console.log('❌ "No context yet" elements:', noContextElements.length, noContextElements);
  
  // 6. Check for actual context values
  const contextValueElements = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent?.includes('Mood Tracking:') || 
    el.textContent?.includes('Clothing Inventory:') ||
    el.textContent?.includes('Location Tracking:')
  );
  console.log('✅ Context value elements:', contextValueElements.length, contextValueElements);
  
  // 7. Return summary
  return {
    chatId,
    contextDisplaysFound: contextDisplays.length,
    contextButtonsFound: contextButtons.length,
    noContextElementsFound: noContextElements.length,
    contextValueElementsFound: contextValueElements.length,
    recommendation: contextValueElements.length > 0 ? 
      '✅ Context values are being displayed!' : 
      '❌ Context values are NOT being displayed. Check logs for issues.'
  };
}

// Run verification
const result = verifyContextTracking();
console.log('📊 VERIFICATION RESULT:', result);

// Additional helper to check component props
window.checkContextProps = function() {
  console.log('🔍 Use React DevTools to inspect:');
  console.log('1. Find MessageGroup component');
  console.log('2. Check trackedContext prop');
  console.log('3. Find ContextDisplay component');
  console.log('4. Check currentContext, addonSettings props');
  console.log('5. Verify data format matches expected TrackedContext interface');
};

console.log('💡 Run window.checkContextProps() for additional debugging tips');
