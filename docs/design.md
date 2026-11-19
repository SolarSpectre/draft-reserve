# Draft Reserve design

Draft Reserve uses an esports broadcast scoreboard above an interactive replay. The same board holds the original pick, a proposed replacement, the lockout changes, and opponent evidence.

| Token | Value | Use |
| --- | --- | --- |
| Navy | `#09121f` | Page background |
| Slate | `#101e2d` | Replay surfaces and controls |
| Cyan | `#64e3f2` | Current game, main action, and the left scoreboard team |
| Seafoam | `#a7ede7` | Reopened picks |
| Coral | `#ffc1b1` | Newly locked picks and the right scoreboard team |

Barlow is used across the replay. Text labels accompany color changes. The draft and scouting panels sit side by side on desktop and stack on narrow screens.

Motion animates the lockout changes and scouting bars. The replay button plays the lockout transition on demand. Reduced-motion preferences disable the transition and briefing autoplay.

## Prototype

Use Node 24, then run `npm ci` and `npm run dev`. The sample series and its scouting counts are fictional. Champion names and portraits come from the same pinned Riot Data Dragon catalog used for imported GRID matches. `npm run build` type-checks the code and builds the site into `dist`.

The artwork and briefing live in `public/media/`. The built-in image generation tool created the landscape. The short silent briefing uses that original still with camera movement and three title cards.

### Artwork prompt

> Use case: stylized-concept. Create a single original, wide cinematic landscape keyframe for a League-inspired esports draft analysis website, completely distinct original geography and no recognizable game assets. Blue hour above a mountain river where dark basalt cliffs and ancient stone arches frame a winding current. Environment occupies the right two thirds; the far left fades into low-detail ink-blue storm haze for interface typography. A river crossing and a low ruined rampart catch thin trails of warm brass torchlight. Immersive atmospheric depth, textured stone, dark indigo, cool mineral blue with muted champagne haze, subtle volumetric mist and tiny warm lights. Painterly AAA fantasy environment concept art with credible materials and sophisticated restrained lighting, no neon, no oversaturated green, no characters, no logos, no typography, no text, no UI, no watermark. Wide landscape, keep the most detailed and best lit subject on the right side, designed to crop as a panoramic banner.
