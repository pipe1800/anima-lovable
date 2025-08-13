export function parseExampleDialogue(dialogueString: string | undefined): Array<{ user: string; character: string }> {
  if (!dialogueString || typeof dialogueString !== 'string') return [];

  const dialogues: Array<{ user: string; character: string }> = [];
  const cleanedString = dialogueString
    .replace(/<START>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  const blocks = cleanedString.split(/\n\n+/).filter(block => block.trim());

  let currentUser = '';
  let currentChar = '';

  for (const block of blocks) {
    const lines = block.split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.match(/^(\{\{user\}\}|User|You):/i)) {
        if (currentUser && currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentChar = '';
        }
        currentUser = line.replace(/^(\{\{user\}\}|User|You):/i, '').trim();
      } else if (line.match(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/)) {
        currentChar = line.replace(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/, '').trim();
      } else if (line.trim()) {
        if (currentUser && !currentChar) {
          currentChar = line.trim();
        } else if (currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentUser = line.trim();
          currentChar = '';
        }
      }
    }
  }

  if (currentUser && currentChar) {
    dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
  }

  if (dialogues.length === 0 && blocks.length >= 2) {
    for (let i = 0; i < blocks.length - 1; i += 2) {
      dialogues.push({
        user: blocks[i].trim(),
        character: blocks[i + 1]?.trim() || ''
      });
    }
  }

  return dialogues;
}
