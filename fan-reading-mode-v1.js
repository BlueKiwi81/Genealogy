function installReadingModeStyles(){
  if(document.getElementById('fanReadingModeStyles'))return;
  const style=document.createElement('style');
  style.id='fanReadingModeStyles';
  style.textContent=`
    /* Unknown ancestry should recede, but still be visible enough to invite research. */
    .unknown-parent-node>path{fill-opacity:.16!important;stroke-opacity:.56!important}
    .unknown-parent-node .fan-label{opacity:.32!important}
    .unknown-parent-node .fan-date{opacity:.24!important}
    .unknown-parent-node.is-actionable>path{fill-opacity:.22!important;stroke-opacity:.68!important}
  `;
  document.head.appendChild(style);
}

installReadingModeStyles();
document.addEventListener('genealogy:archive-ready',installReadingModeStyles);
