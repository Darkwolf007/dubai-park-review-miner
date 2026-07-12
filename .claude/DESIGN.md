---
version: alpha
name: Mux Motion Industrial
description: A light, technical, editorial system with bold orange accents, monospaced hero type, and minimal depth.
colors:
  primary: "#FF6100"
  secondary: "#000000"
  tertiary: "#828C97"
  neutral: "#E2E4DD"
  surface: "#FFFFFF"
  on-surface: "#000000"
  error: "#D92D20"
  primary-60: "#FF8A3D"
  primary-20: "#FFD3B8"
  neutral-95: "#F5F6F2"
  neutral-20: "#B8BDB5"
typography:
  headline-display:
    fontFamily: Rotonto
    fontSize: 50px
    fontWeight: 400
    lineHeight: 57.5px
    letterSpacing: 1px
  headline-lg:
    fontFamily: JetBrainsMono
    fontSize: 39px
    fontWeight: 400
    lineHeight: 47px
    letterSpacing: 0px
  headline-md:
    fontFamily: Aeonik
    fontSize: 30px
    fontWeight: 400
    lineHeight: 36px
    letterSpacing: 0px
  headline-sm:
    fontFamily: Aeonik
    fontSize: 23px
    fontWeight: 400
    lineHeight: 27.6px
    letterSpacing: 0px
  body-lg:
    fontFamily: Aeonik
    fontSize: 18px
    fontWeight: 400
    lineHeight: 27px
    letterSpacing: 0.36px
  body-md:
    fontFamily: Aeonik
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0.24px
  body-sm:
    fontFamily: Aeonik
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.2px
  label-lg:
    fontFamily: JetBrainsMono
    fontSize: 18px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  label-md:
    fontFamily: JetBrainsMono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  label-sm:
    fontFamily: JetBrainsMono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
  caption:
    fontFamily: Aeonik
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  none: 0px
  sm: 4px
  md: 12px
  lg: 28px
  xl: 112px
  full: 9999px
spacing:
  xs: 4px
  sm: 14px
  md: 32px
  lg: 56px
  xl: 76px
  gutter: 24px
  margin: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.xl}"
    padding: 14px 56px
    height: 56px
  button-primary-hover:
    backgroundColor: "{colors.primary-60}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.xl}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.xl}"
    padding: 14px 56px
    height: 56px
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: 0px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 56px 0px 0px
  panel-dark:
    backgroundColor: "#242628"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: 56px 0px 0px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 14px 16px
  chip:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 0px
---

# Mux Motion Industrial

## Overview
Mux feels technical, confident, and lightly playful: the brand is serious about developer tooling, but the orange accents and quirky robot graphics keep it approachable. The layout is spacious and editorial rather than dense, with a centered hero and clear hierarchy that helps complex product messaging stay readable. It targets builders and technical decision-makers who expect clarity, credibility, and a fast path to action.

## Colors
- **Primary (#FF6100):** The signature safety-orange accent used for the strongest CTA buttons, small badges, and moments that need immediate attention. It brings energy and motion without making the page feel loud.
- **Secondary (#000000):** Pure black used for headlines, navigation, and button text. It creates the crisp, high-contrast editorial look that anchors the layout.
- **Tertiary (#828C97):** A cool gray-blue used for borders, dividers, and understated UI chrome. It keeps structure visible without competing with the orange accent.
- **Neutral (#E2E4DD):** The warm off-white page background that softens the system and makes the black typography feel especially sharp.
- **Surface (#FFFFFF):** White surfaces for cards, pills, and content panels. These sit cleanly on the neutral backdrop and support a layered layout.
- **On-surface (#000000):** Default text color on white surfaces and light UI elements for maximum legibility.
- **Error (#D92D20):** Reserved for destructive or invalid states; it should be used sparingly so it does not break the calm, minimal palette.
- **Primary-60 (#FF8A3D) and Primary-20 (#FFD3B8):** Lighter orange variants for hover states, focus treatments, and subtle emphasis.
- **Neutral-95 (#F5F6F2) and Neutral-20 (#B8BDB5):** Supporting neutrals for backgrounds, disabled states, and secondary UI structure.

## Typography
Mux mixes three distinct voices: Rotonto for the oversized hero, JetBrains Mono for system-like labels and the most distinctive headings, and Aeonik for the body copy and supporting UI. The hierarchy is intentionally expressive but controlled: the display headline is letter-spaced and geometric, while paragraphs stay clean, compact, and highly readable.

Headlines should feel architectural and slightly futuristic. Use `headline-display` for the main hero, `headline-lg` for large section statements, and `headline-md` / `headline-sm` for product feature titles and supporting headings.

Body text should always use Aeonik for clarity and warmth. `body-lg` suits lead paragraphs, `body-md` is the default reading size, and `body-sm` works for secondary UI copy and metadata.

Labels and buttons lean on JetBrains Mono to reinforce the developer audience. `label-md` and `label-sm` are appropriate for buttons, tags, nav items, and small system labels. Uppercase treatment is used sparingly, mostly where the brand wants a more technical, machine-like feel.

## Layout
The page uses a centered, fixed-max-width composition within a full-bleed neutral background. Large top/bottom sections are separated by generous vertical breathing room, and content is often organized in symmetrical blocks to preserve calm and legibility.

Spacing rhythm is loose and deliberate: `xs` and `sm` support fine-grain UI gaps, while `md`, `lg`, and `xl` define section separation and hero spacing. Cards and panels rely on substantial internal padding, especially top padding, which creates a staged, gallery-like presentation.

Horizontal structure depends on strong gutters and visible column boundaries in some sections, but the overall impression is still editorial rather than grid-heavy. Use wide margins, centered content, and ample whitespace around primary CTAs.

## Elevation & Depth
The system is nearly flat. There are no meaningful shadows, and hierarchy comes from contrast, borders, and tonal separation instead of elevation. Thin gray strokes define cards, buttons, and sections, while white and neutral surfaces provide enough layering to keep content distinct.

This flatness is intentional: it keeps the interface crisp, modern, and product-focused. If depth is needed, prefer border contrast or a subtle change in background tone rather than blur or drop shadow.

## Shapes
The shape language is rounded but restrained. Buttons are pill-like with the `rounded.xl` radius, while cards use a softer `rounded.lg` curve that still feels structured and engineered.

Overall, the geometry feels industrial and friendly at the same time: not sharp, not bubbly, but smooth enough to soften the black typography and technical motifs. Small chips and badges should be fully pill-shaped or circular where appropriate.

## Components
Buttons are the most expressive component and should remain bold, accessible, and compact in height. `button-primary` uses the orange fill with black mono text, fixed 56px height, and wide horizontal padding for a strong call-to-action. `button-secondary` is more restrained but still visually prominent; in this system it reads as a white or light surface treatment with black text and the same pill radius. `button-tertiary` should be minimal, text-only, and used for secondary navigation or lightweight actions.

Cards should be white or near-white on the neutral canvas, with a thin tertiary border and generous top padding. Use `card` for light content blocks and `panel-dark` when a dramatic dark inset is needed for media or featured stories. Keep shadow usage off; cards should feel like cut paper rather than floating surfaces.

Inputs should follow the same calm geometry as cards: white background, subtle border, comfortable padding, and Aeonik body text. Focus states can use the primary orange or a stronger tertiary border, but avoid heavy visual effects.

Chips and badges should be small, rounded, and quiet. Use `chip` for beta labels, category pills, and compact status indicators; keep them low-contrast unless they are the main accent of the row.

Navigation links should stay simple and text-led. Use `nav-link` styling for top-level nav items, and reserve the bold mono treatment for buttons, utility labels, and developer-oriented microcopy.

## Do's and Don'ts
- Do keep the orange accent for one or two primary actions per view.
- Do use large whitespace and centered alignment for hero sections.
- Do prefer borders and tone changes over shadows for depth.
- Do use Aeonik for readable paragraphs and JetBrains Mono for technical labels.
- Do keep CTAs pill-shaped and consistently 56px tall.
- Don't crowd the layout with too many competing accents or colors.
- Don't introduce soft shadows, glassmorphism, or heavy gradients.
- Don't use rounded corners that are either fully square or overly bubbly; stay within the system's measured radii.