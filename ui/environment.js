/* Existing conditions, named by purpose. These are not a single device switch.
   CSS keeps the corresponding expressions and their original cascade order. The shell/desktop boundary is
   one number written as exact complements, (width < 1750px) and (width >= 1750px), so a fractional CSS
   width (non-100% zoom, e.g. 1749.6px) is always one or the other. The other complementary pairs follow
   the same rule: (width <= 600px) / (width > 600px), (width <= 850px) / (width > 850px) and
   (height <= 500px) / (height > 500px), so 600.4px, 850.4px or 500.4px is never in a gap. */
const UI_MEDIA = Object.freeze({
  reducedMotion: matchMedia('(prefers-reduced-motion:reduce)'),
  compactSelection: matchMedia('(width < 1750px)'),
  narrowLayout: matchMedia('(width <= 600px)'),
  wideJournalSelection: matchMedia('(width >= 1750px)'),
  desktopRecordRail: matchMedia('(width > 600px)'),
  wideRecordRow: matchMedia('(width >= 1750px)'),
  coarseInput: matchMedia('(pointer:coarse)'),
  /* The mobile shell (ui/mobile.js, ui/styles/mobile.css): same range as compactSelection, kept as its own
     name because it switches page structure rather than one control. Below 1750px a forecast card on
     step 3 can no longer keep its first stat line (力量·魔力·技巧·速度·HP) on one line beside the pass rate
     (fits from 1730px, plus room for a 17px page scrollbar), so every pointer type gets the mobile shell. */
  mobileShell: matchMedia('(width < 1750px)')
});
