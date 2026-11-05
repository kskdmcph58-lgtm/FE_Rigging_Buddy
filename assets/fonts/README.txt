WLQS fonts

wlqs-system-cn.woff2: converted from __System_CNzh.bffnt.zst.
wlqs-number.woff2: digits 0-9 and +/- from __Number.bffnt.zst.
wlqs-level-up.woff2: upgrade title capitals and large level digits from
__FEFont_Large.bffnt.zst.

Source directory: tests/WLQS/room/romfs/Font (local game resources).
The original fonts contain BC4 bitmap atlases, not TrueType outlines.
These WOFF2 files trace the antialiased half-intensity glyph contours,
preserving the original character mapping, advance widths and baseline.
System CN covers GB2312, Latin text and characters used in the application;
unsupported custom characters fall back to system fonts in styles.css.
Number is used for stat increments and normal numeric displays.
Level Up is reserved for the upgrade title and large upgraded level display.
The title string must be "Level Up", matching MID_Sys_LevelUp in System.msbt.
Its lowercase glyphs appear as capitals; p has a different foot from P.
Do not uppercase the string with CSS or it will select the wrong P glyph.

Verified layout references in Common.arc.zst:
Common_LvUp.bflyt T_Title / T_NumAfter -> FEFont_Large.fcpx
Common_LvUpStatus.bflyt T_Status -> System.fcpx
Common_LvUpStatus.bflyt T_Plus / T_NumUp -> Number.fcpx
Common_StatusNum.bflyt T_Num -> Number.fcpx

Regenerate: python scripts/import_wlqs_fonts.py
Dependencies: fonttools, brotli, numpy, Pillow, zstandard, texture2ddecoder.
Source hashes and character counts are recorded in manifest.json.
The original font designs and game resources belong to their respective
rights holders. Conversion does not grant a new license to those designs.
