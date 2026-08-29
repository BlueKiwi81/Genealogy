if (!document.getElementById('genealogyLanguageStyles')) {
  const link = document.createElement('link');
  link.id = 'genealogyLanguageStyles';
  link.rel = 'stylesheet';
  link.href = './language-v1.css?v=2';
  document.head.appendChild(link);
}

await import('./language-v1.js?v=2');
await import('./language-ai-bridge-v1.js?v=2');
await import('./contribution-guide-i18n-v1.js?v=1');
