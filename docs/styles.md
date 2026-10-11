## 12. UI Design System: Font Families, Colors, and Typography

Ang frontend ng A.SSET ay gumagamit ng custom design system na nakabase sa Tailwind CSS at mga Google Fonts. Ang mga pangunahing references ay nasa:

- `frontend/src/styles.css`
- `frontend/src/app/components/navbar/navbar.html`
- `frontend/src/app/pages/hero/hero.html`
- `frontend/src/app/pages/about/about.html`
- `frontend/src/app/pages/contact/contact.html`
- `frontend/src/app/components/footer/footer.html`
- `frontend/src/app/pages/auth/login/login.html`

### A. Font families

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
```

| Purpose | Font family | Used weights | Notes |
| --- | --- | --- | --- |
| Body text | `DM Sans` | 400, 500, 600, 700 | Default font for paragraphs, inputs, navigation, labels |
| Headings / emphasis | `Plus Jakarta Sans` | 600, 700, 800 | Used for h1-h4, badge labels, major CTAs |

```css
body {
  color: #0f172a;
  font-family: 'DM Sans', sans-serif;
}

h1,
h2,
h3,
h4,
button,
a {
  font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
}
```

### B. Font sizes used in the code

Ang project ay gumagamit ng responsive Tailwind typography classes. Narito ang mga active sizes na lumalabas sa actual code:

| Tailwind class | Approx px size | Common use |
| --- | --- | --- |
| `text-[0.6rem]` | 9.6px | small workflow badges |
| `text-[0.65rem]` | 10.4px | section labels |
| `text-[0.7rem]` | 11.2px | form labels |
| `text-xs` | 12px | small meta text, copyright, helper labels |
| `text-sm` | 14px | paragraph text, form value text |
| `text-base` | 16px | default brand/logo text |
| `text-lg` | 18px | large supportive text |
| `text-xl` | 20px | footer brand text |
| `text-2xl` | 24px | sign-in headings |
| `text-3xl` | 30px | section heroes |
| `text-4xl` | 36px | main hero mobile heading |
| `text-5xl` | 48px | main hero desktop heading |
| `text-6xl` | 60px | large hero desktop display |
| `text-7xl` | 72px | extra large hero banner |

#### Mga highlight na maaring makita sa layout

- Logo brand sa Navbar: `text-base sm:text-lg lg:text-xl`
- Hero heading: `text-4xl sm:text-5xl lg:text-6xl xl:text-7xl`
- About/Contact headings: `text-2xl sm:text-3xl lg:text-4xl`
- General paragraph: `text-sm sm:text-base lg:text-lg`
- Form labels: `text-[0.7rem] font-bold uppercase tracking-wide`
- Buttons: `text-[0.6rem] sm:text-xs lg:text-sm` depending on CTA variation

### C. Color palette used in the UI

#### 1. Primary brand colors (blue system)

| Token | Hex | Usage |
| --- | --- | --- |
| `bg-blue-600` | `#2563eb` | main CTA buttons, active states |
| `bg-blue-500` | `#3b82f6` | hover states, highlights |
| `bg-blue-400` | `#60a5fa` | accent text, outlines |
| `bg-blue-300` | `#93c5fd` | soft decorative accents |
| `bg-blue-200` | `#bfdbfe` | gradient highlight |
| `bg-blue-100` | `#dbeafe` | soft containers and icon backgrounds |
| `bg-blue-500/10` | rgba(59,130,246,0.10) | translucent badges/backgrounds |
| `bg-blue-600/20` | rgba(37,99,235,0.20) | overlays and hover surfaces |

#### 2. Neutral colors (slate/white)

| Token | Hex | Usage |
| --- | --- | --- |
| `bg-slate-950` | `#020617` | dark background overlay |
| `bg-slate-900` | `#0f172a` | primary dark nav/footer background |
| `bg-slate-800` | `#1e293b` | footer cards and dark panels |
| `bg-slate-700` | `#334155` | dark text labels |
| `bg-slate-600` | `#475569` | supporting text |
| `bg-slate-300` | `#cbd5e1` | secondary lines and subtle text |
| `bg-slate-200` | `#e2e8f0` | light borders |
| `bg-slate-100` | `#f1f5f9` | light feature cards |
| `bg-slate-50` | `#f8fafc` | soft background sections |
| `text-slate-900` | `#0f172a` | default dark text |
| `text-slate-700` | `#334155` | input labels |
| `text-slate-600` | `#475569` | paragraph text |
| `text-slate-500` | `#64748b` | supporting details |
| `text-slate-300` | `#cbd5e1` | light text on dark backgrounds |
| `text-white` | `#ffffff` | primary light text |

#### 3. Accent and state colors

| Token | Hex | Usage |
| --- | --- | --- |
| `bg-amber-500` | `#f59e0b` | live status dot and highlight accents |
| `bg-amber-400` | `#fbbf24` | pulse effect, design separators |
| `bg-amber-300` | `#fcd34d` | soft gold highlight |
| `bg-emerald-50` | `#ecfdf5` | success banner backgrounds |
| `bg-emerald-200` | `#a7f3d0` | success border |
| `text-emerald-800` | `#065f46` | success text |
| `bg-red-50` | `#fef2f2` | error state backgrounds |
| `bg-red-200` | `#fecaca` | error borders |
| `text-red-800` | `#991b1b` | error text |

#### 4. Base color in CSS

```css
body {
  margin: 0;
  color: #0f172a;
  font-family: 'DM Sans', sans-serif;
}
```

This makes `#0f172a` the main text color for the app default theme.

### D. Typography behavior / design pattern

- Body text is generally `DM Sans` for readability and straightforward UI content.
- Headings, CTAs, and label emphasis use `Plus Jakarta Sans` for a more modern campus-tech brand look.
- The project uses a clean contrast system:
  - dark text on light background for most pages;
  - white/light text on dark backgrounds for hero, navbar, and footer;
  - blue as the primary action color;
  - amber as a small accent / status color.
- Letter spacing is intentionally elevated for prominent text with classes like:
  - `tracking-[0.15em]`
  - `tracking-[0.18em]`
  - `tracking-[0.2em]`

### E. Practical summary

Kung ia-aggregate mo ang buong design system ng project, ang core branding ay:

- Brand palette: blue + white + slate + amber accent
- Default body text color: `#0f172a`
- Default light background: `#ffffff`
- Main action color: `#2563eb`
- Hover CTA color: `#3b82f6`
- Accent gold: `#f59e0b`
- Heading font: `Plus Jakarta Sans`
- Body font: `DM Sans`

This is the current actual UI theme used throughout the landing page, auth pages, contact, and footer components.
