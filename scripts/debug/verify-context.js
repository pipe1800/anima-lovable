function verifyContextTracking() {
  console.log('🔍 CONTEXT TRACKING VERIFICATION');
  console.log('================================');
  const chatId = window.location.pathname.split('/').pop();
  console.log('📍 Current Chat ID:', chatId);
  console.log('📋 Check useContextManagement in React DevTools');
  const contextDisplays = document.querySelectorAll('[class*="ContextDisplay"]');
  console.log('🎨 ContextDisplay components found:', contextDisplays.length);
  const contextButtons = Array.from(document.querySelectorAll('button')).filter(btn => btn.textContent?.includes('Context'));
  console.log('🔘 Context buttons found:', contextButtons.length, contextButtons);
  const noContextElements = Array.from(document.querySelectorAll('*')).filter(el => el.textContent?.includes('No context yet'));
  console.log('❌ "No context yet" elements:', noContextElements.length, noContextElements);
  const contextValueElements = Array.from(document.querySelectorAll('*')).filter(el => (
    el.textContent?.includes('Mood Tracking:') ||
    el.textContent?.includes('Clothing Inventory:') ||
    el.textContent?.includes('Location Tracking:')
  ));
  console.log('✅ Context value elements:', contextValueElements.length, contextValueElements);
  return {
    chatId,
    contextDisplaysFound: contextDisplays.length,
    contextButtonsFound: contextButtons.length,
    noContextElementsFound: noContextElements.length,
    contextValueElementsFound: contextValueElements.length,
    recommendation: contextValueElements.length > 0 ? '✅ Context values are being displayed!' : '❌ Context values are NOT being displayed.'
  };
}
window.verifyContextTracking = verifyContextTracking;
window.checkContextProps = function() {
  console.log('Use React DevTools to inspect MessageGroup and ContextDisplay component props.');
};
console.log('Run verifyContextTracking() to begin context UI verification');
