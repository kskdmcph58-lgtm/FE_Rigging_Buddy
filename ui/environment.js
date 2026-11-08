/* Existing conditions, named by purpose. These are not a single device switch.
   CSS keeps the corresponding expressions and their original cascade order. */
const UI_MEDIA = Object.freeze({
  reducedMotion: matchMedia('(prefers-reduced-motion:reduce)'),
  compactSelection: matchMedia('(max-width:600px), (max-width:1100px) and (pointer:coarse)'),
  narrowLayout: matchMedia('(max-width:600px)'),
  wideJournalSelection: matchMedia('(min-width:1100px)'),
  desktopRecordRail: matchMedia('(min-width:601px)'),
  wideRecordRow: matchMedia('(min-width:1100px)'),
  coarseInput: matchMedia('(pointer:coarse)'),
  /* The mobile shell (ui/mobile.js, ui/styles/mobile.css): same range as compactSelection, kept as its own
     name because it switches page structure rather than one control. Desktop never matches it. */
  mobileShell: matchMedia('(max-width:600px), (max-width:1100px) and (pointer:coarse)')
});
