# Draft Reserve design

Draft Reserve is a League-inspired broadcast desk for rehearsing one decision between Games 4 and 5. The series timeline leads into two draft states, a shared lockout difference, opponent evidence, and a prep note a coach can copy.

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#0b141a` | Canvas and pauses between sections |
| Slate | `#101e27` | Draft and evidence surfaces |
| Brass | `#dec08a` | Current game, focus of the comparison, and main actions |
| River teal | `#8bdbcb` | Reopened champions |
| Ember | `#e7a890` | Newly locked champions |

Cinzel sets titles and champion names. Barlow carries controls, dense evidence, and tabular counts. Put labels beside color changes so the difference is readable by text alone. Keep the desktop comparison and evidence adjacent. Stack the evidence below the comparison on narrow screens.

Use Motion for the replacement crest, lockout difference, and scouting rows. Keep these transitions under 300 ms. Respect the user's reduced-motion setting and play the briefing only when opened. The motion tells the coach which champion returns and which leaves.

## Prototype

Use Node 24, then run `npm ci` and `npm run dev`. The mock series, champion names, and scouting counts are fictional. `npm run build` type-checks the code and builds the site into `dist`.

The artwork and briefing live in `public/media/`. The built-in image generation tool created the landscape. The short silent briefing uses that original still with camera movement and three title cards.

### Artwork prompt

> Use case: stylized-concept. Create a single original, wide cinematic landscape keyframe for a League-inspired esports draft analysis website, completely distinct original geography and no recognizable game assets. Blue hour above a mountain river where dark basalt cliffs and ancient stone arches frame a winding current. Environment occupies the right two thirds; the far left fades into low-detail ink-blue storm haze for interface typography. A river crossing and a low ruined rampart catch thin trails of warm brass torchlight. Immersive atmospheric depth, textured stone, dark indigo, cool mineral blue with muted champagne haze, subtle volumetric mist and tiny warm lights. Painterly AAA fantasy environment concept art with credible materials and sophisticated restrained lighting, no neon, no oversaturated green, no characters, no logos, no typography, no text, no UI, no watermark. Wide landscape, keep the most detailed and best lit subject on the right side, designed to crop as a panoramic banner.
