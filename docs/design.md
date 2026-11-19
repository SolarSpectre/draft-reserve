# Draft Reserve design

Draft Reserve takes its layout from a replay editor. A split preview shows the recorded pick and its replacement in one frame, with replay controls, lockout outcomes, and the series timeline directly below. The score and opponent evidence sit alongside it. Select a recorded game to see its draft order or choose a checkpoint to rehearse a swap.

| Token | Value | Use |
| --- | --- | --- |
| Ice | `#eef2f7` | Workspace background |
| White | `#fff` | Score, scouting, and dialog surfaces |
| Cobalt | `#2b50a1` | Checkpoint and primary actions |
| Green | `#23634e` | Reopened picks |
| Terracotta | `#8b4332` | Newly locked picks |

Barlow sets the headings, score, controls, and scouting data. On narrow screens the pick comparison and timeline come first, followed by the score and scouting evidence.

GSAP staggers the title’s focus effect and sequences the two lockout changes when a swap changes or replays. The playhead moves when the checkpoint changes, Motion animates scouting bars, and the match art ripples under the pointer. Reduced-motion preferences keep these elements still and disable briefing autoplay. The title adapts the [React Bits Blur Text](https://www.reactbits.dev/text-animations/blur-text) interaction.

## Prototype

Use Node 24, then run `npm ci` and `npm run dev`. The sample series and its scouting counts are fictional. Champion names and portraits come from the same pinned Riot Data Dragon catalog used for imported GRID matches. `npm run build` type-checks the code and builds the site into `dist`.

Riot Data Dragon supplies the [Azir splash art](https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Azir_0.jpg) in the series banner, the [Orianna splash art](https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Orianna_0.jpg) in the comparison, and four bundled champion portraits. The short silent briefing uses its original landscape with camera movement and three title cards. All of these assets live in `public/media/`.

### Briefing artwork prompt

> Use case: stylized-concept. Create a single original, wide cinematic landscape keyframe for a League-inspired esports draft analysis website, completely distinct original geography and no recognizable game assets. Blue hour above a mountain river where dark basalt cliffs and ancient stone arches frame a winding current. Environment occupies the right two thirds; the far left fades into low-detail ink-blue storm haze for interface typography. A river crossing and a low ruined rampart catch thin trails of warm brass torchlight. Immersive atmospheric depth, textured stone, dark indigo, cool mineral blue with muted champagne haze, subtle volumetric mist and tiny warm lights. Painterly AAA fantasy environment concept art with credible materials and sophisticated restrained lighting, no neon, no oversaturated green, no characters, no logos, no typography, no text, no UI, no watermark. Wide landscape, keep the most detailed and best lit subject on the right side, designed to crop as a panoramic banner.
