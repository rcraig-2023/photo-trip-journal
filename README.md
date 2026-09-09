# Trip Journal

Build a mobile-first travel diary web app called Touri.

Touri helps people effortlessly capture, organize, and revisit multi-city trips. The key idea is that travelers already take photos on their phones, so Touri should fit naturally into that behavior.

CORE EXPERIENCE:

Open Touri → choose current trip/city → tap + Add → select multiple photos from phone → upload → Touri organizes them automatically → AI can identify landmarks → user confirms suggestions → memories become part of a visual travel diary.

MOBILE-FIRST / PWA:

Build Touri as a responsive mobile-first web app with PWA capabilities. The phone experience is the primary experience; desktop is secondary for revisiting and editing trips.

The app should feel app-like on mobile and be designed for touch. Users must be able to select multiple photos directly from their phone's photo library. Do not design around requiring users to transfer photos to a laptop.

Keep the backend architecture independent from the frontend so the same backend can later support native iOS and Android apps.

NAVIGATION:

Use a simple mobile navigation such as:

Today | Trip | + Add | Memories

The + Add action should provide:

Photos | Jot | Landmark | Restaurant

CORE STRUCTURE:

Home/Today

→ Trip

→ City

→ Jots / Landmarks / Photos / Restaurants

CITY EXPERIENCE:

A city should feel like a chapter in a personal travel journal, not a dashboard.

Use a visual, editorial travel timeline combining:

- Photos

- Jots

- Landmarks

- Restaurants

- Dates/times

- Locations

Example:

LONDON

United Kingdom · September 4–8

11:18

Tower Bridge

[photos]

14:03

“Walked along the Thames...”

19:27

Dishoom

[photo]

VISUAL DESIGN:

Do NOT use a generic SaaS dashboard aesthetic.

Avoid:

- repetitive rounded cards

- rigid 3-column grids

- excessive dashboard statistics

- generic hero sections

- excessive badges

- heavy gradients

- generic AI visuals

- overly symmetrical layouts

Instead, create a distinctive:

- editorial

- photographic

- personal

- modern travel journal aesthetic

Keep the color palette neutral, warm, restrained, and sophisticated.

Create personality through typography, large photography, asymmetric layouts, editorial composition, subtle borders/rules, dates, location details, and thoughtful spacing.

Use a distinctive serif/display typeface for major titles paired with a clean sans-serif for UI.

Photos should be a major visual element, not just thumbnails inside cards.

CORE SCREENS:

- Authentication

- Today/Home

- Create Trip

- Trip Overview

- City

- City Timeline

- Jots

- Landmarks

- Photos

- Restaurants

- Batch Photo Upload

- New Memories/Inbox

- Landmark Detail

- Photo Detail

- Restaurant Detail

- Settings

IMPORTANT:

Prioritize the mobile Today screen, City experience, batch photo upload flow, and editorial visual identity over secondary features.

The product should feel like a personal travel object that organizes itself, not like productivity software.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/380391ed-e242-4ddb-9a51-ea0cd36cd3f4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
