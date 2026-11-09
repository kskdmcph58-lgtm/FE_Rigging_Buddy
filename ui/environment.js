/* Existing conditions, named by purpose. These are not a single device switch.
   CSS keeps the corresponding expressions and their original cascade order. */
const UI_MEDIA = Object.freeze({
  reducedMotion: matchMedia('(prefers-reduced-motion:reduce)'),
  compactSelection: matchMedia('(max-width:1749px)'),
  narrowLayout: matchMedia('(max-width:600px)'),
  wideJournalSelection: matchMedia('(min-width:1750px)'),
  desktopRecordRail: matchMedia('(min-width:601px)'),
  wideRecordRow: matchMedia('(min-width:1750px)'),
  coarseInput: matchMedia('(pointer:coarse)'),
  /* The mobile shell (ui/mobile.js, ui/styles/mobile.css): same range as compactSelection, kept as its own
     name because it switches page structure rather than one control. Below 1750px a forecast card on
     step 3 can no longer keep its first stat line (力量·魔力·技巧·速度·HP) on one line beside the pass rate
     (fits from 1730px, plus room for a 17px page scrollbar), so every pointer type gets the mobile shell. */
  mobileShell: matchMedia('(max-width:1749px)')
});
