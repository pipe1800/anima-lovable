import React from 'react';

// --- Test Data and Function ---

const testDialogueString = "START\n{{user}}: I'm unsure whether to confront this person or let it go.\n{{char}}: May I advise a calculated pause? Gather intelligence first—never strike until your advantage is certain. Yet, if you wish to act now, I will support your judgment and prepare accordingly.";

// This is the simplified parsing logic you suggested.
// We are putting it directly here to guarantee it's the code being run.
function parseExampleDialogueForTest(dialogueString: string): Array<{ user: string; character: string }> {
  if (!dialogueString || typeof dialogueString !== 'string') {
    return [];
  }

  const lines = dialogueString.split('\n').filter(line => line.trim() !== '' && !line.trim().toUpperCase().includes('START'));
  
  const pairs: Array<{ user: string; character: string }> = [];
  let currentUserMessage = '';

  for (const line of lines) {
    if (line.includes('{{user}}:')) {
      if (currentUserMessage) {
        pairs.push({ user: currentUserMessage, character: '' });
      }
      currentUserMessage = line.replace('{{user}}:', '').trim();
    } else if (line.includes('{{char}}:')) {
      if (currentUserMessage) {
        pairs.push({
          user: currentUserMessage,
          character: line.replace('{{char}}:', '').trim()
        });
        currentUserMessage = ''; // Reset for the next turn
      }
    }
  }

  if (currentUserMessage) {
    pairs.push({ user: currentUserMessage, character: '' });
  }

  return pairs;
}


// --- The Test Component ---

const DialogueTestPage = () => {
  const parsedOutput = parseExampleDialogueForTest(testDialogueString);

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', backgroundColor: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ color: 'white', borderBottom: '1px solid #444', paddingBottom: '1rem' }}>Dialogue Parser Test Page</h1>
      
      <h2 style={{ color: '#0f0' }}>Input String:</h2>
      <pre style={{ whiteSpace: 'pre-wrap', backgroundColor: '#222', padding: '1rem', borderRadius: '5px', border: '1px solid #333' }}>
        {testDialogueString}
      </pre>

      <h2 style={{ color: '#0f0', marginTop: '2rem' }}>Parsed Output:</h2>
      <pre style={{ whiteSpace: 'pre-wrap', backgroundColor: '#222', padding: '1rem', borderRadius: '5px', border: '1px solid #333', fontSize: '1.1rem' }}>
        {JSON.stringify(parsedOutput, null, 2)}
      </pre>
    </div>
  );
};

export default DialogueTestPage;