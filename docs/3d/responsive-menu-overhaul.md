# Responsive 3D menus

The 3D menus now use the viewport as their frame. Headers, navigation, and primary actions remain visible while longer content scrolls inside its selected panel.

**Preparation**

Ground, Kit, and Conditions share one persistent shell. Laptop layouts keep the map beside equipment or conditions. Narrow screens show one panel at a time. Short landscape screens put property and truck-entry choices beside the map. Panel selection, local scroll, puppy drafts, and picker focus survive changes that rebuild the preparation DOM. Map entries retain the atlas's 30px inset.

**Choice controls**

`enhanceMenuSelects(root)` progressively enhances single-select fields. Native IDs, options, values, form submission, and change handlers remain authoritative. Desktop gets an anchored choice panel; narrow phones and short coarse-pointer screens get a bounded sheet. Options support descriptions, selection marks, keyboard navigation, typeahead, and internal scrolling. Escape closes the picker and restores focus without reaching the field's resume shortcut. Unsupported browsers retain native controls.

Call `sync()` after changing options, values, or disabled state in code. Call `destroy()` before replacing a screen. Preparation restores focus to the replacement trigger after rerendering; the field interface disposes its manager with its other listeners.

**Other menus**

The field menu separates Your hunt, Settings, and Field guide, with a persistent return action. Results keep their heading and next-hunt actions outside the scrolling report. The gun rack keeps its weapon stage and launch link visible; design notes are optional. Journal title, counts, Close, and storage information stay outside the scrolling hunt history. Legacy field styles are contained in a CSS layer so menu components can own their sizing without changing the hunting HUD.

**Verification**

The production build and 1,460 tests across 186 files pass, including 11 new picker contract checks. Browser review covered preparation at 1366×768, 1024×768, 390×844, 375×667, and 844×390; portrait and landscape gun rack, field menus, and results; empty journal and a 30-entry in-memory history. Checked property/breed/gun selection, persistent Conditions view, career-name drafts, Escape isolation, launch, pause, end hunt, journal scrolling, and focus restoration. These are desktop-browser viewport checks, not a physical iPhone Safari certification.

Review captures and logs are local in `output/menu-review/`. The production preview is in `output/review-menu-overhaul/`; keep this build unchanged while it is being play-tested. Rebuilding a preview in place can invalidate older browser-cached chunk names; serve a new review build on a fresh origin when necessary.
