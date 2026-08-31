const STYLE_ID = 'genealogyLanguageStyles';

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .language-switcher{
      display:inline-flex;
      align-items:stretch;
      gap:0;
      min-height:42px;
      padding:0;
      overflow:hidden;
      border:1px solid #a99c8e;
      border-radius:10px;
      background:var(--panel,#fffdf8);
      box-shadow:0 1px 0 rgba(255,255,255,.72),inset 0 0 0 1px rgba(255,255,255,.3);
      font-family:Arial,sans-serif;
    }
    .language-switcher::before{
      content:'Language';
      display:inline-flex;
      align-items:center;
      padding:0 10px;
      border-right:1px solid var(--line,#d8cec1);
      background:#f7f1e8;
      color:var(--muted,#6f655c);
      font:700 .66rem/1 Arial,sans-serif;
      letter-spacing:.08em;
      text-transform:uppercase;
      white-space:nowrap;
    }
    html[lang='af'] .language-switcher::before{content:'Taal'}
    .language-choice{
      appearance:none;
      min-height:40px;
      padding:10px 14px;
      border:0;
      border-left:1px solid var(--line,#d8cec1);
      border-radius:0;
      background:transparent;
      color:#554c44;
      cursor:pointer;
      font:700 .84rem/1 Arial,sans-serif;
      transition:background .14s ease,color .14s ease,box-shadow .14s ease;
    }
    .language-switcher .language-choice:first-of-type{border-left:0}
    .language-choice:hover{background:#f2e8dc;color:#3e3329}
    .language-choice.active,.language-choice[aria-pressed='true']{
      background:var(--accent-soft,#ece0d1);
      color:#3e3329;
      box-shadow:inset 0 -3px 0 var(--accent,#5e4935);
    }
    .language-choice:focus-visible{outline:2px solid rgba(94,73,53,.42);outline-offset:-3px}
    @media(max-width:760px){
      .top-actions{flex-wrap:wrap;justify-content:flex-end}
      .language-switcher{order:-1}
      .language-switcher::before{padding-left:8px;padding-right:8px}
      .language-choice{padding-left:10px;padding-right:10px}
    }
    @media(max-width:520px){
      .language-switcher::before{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    }
    @media print{.language-switcher{display:none!important}}
  `;
  document.head.appendChild(style);
}
