/* Existing conditions, named by purpose. These are not a single device switch.
   CSS keeps the corresponding expressions and their original cascade order. */
const UI_MEDIA = Object.freeze({
  reducedMotion: matchMedia('(prefers-reduced-motion:reduce)'),
  compactSelection: matchMedia('(max-width:600px), (max-width:1100px) and (pointer:coarse)'),
  narrowLayout: matchMedia('(max-width:600px)'),
  wideJournalSelection: matchMedia('(min-width:1100px)'),
  desktopRecordRail: matchMedia('(min-width:601px)'),
  coarseInput: matchMedia('(pointer:coarse)')
});
