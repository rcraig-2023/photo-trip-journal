# Touri — Overall Architecture

One high-level view of the photo trip journal, based on the repository implementation reviewed October 30, 2026. Arrows show how the main parts connect; boxes within a group summarize related responsibilities.

```mermaid
flowchart TD
  Traveler["Traveler · phone or desktop"] --> App

  subgraph App["Touri web experience · React + TanStack"]
    Explore["Explore and revisit<br/>Today · Trip and journey map · Dining · Memories"]
    Capture["Capture and organize<br/>Photos · Jots · Landmarks · Restaurants"]
    Journal["Travel journal<br/>Trips → City chapters → Entries and photos"]
    Review["Review new memories<br/>Confirm or correct suggestions"]
    Output["Revisit and share<br/>City lists · Printable trip album"]
    Capture --> Review
    Review --> Journal
    Explore <--> Journal
    Journal --> Output
  end

  Capture --> Pipeline["Photo pipeline<br/>Optimize · Deduplicate · Upload"]
  Journal <--> Data["Journal data access<br/>TanStack Query · Guest or account data"]
  Pipeline --> Local
  Pipeline --> Cloud
  Data <--> Local["Guest storage · browser<br/>localStorage metadata · IndexedDB photos"]
  Data <--> Cloud["Supabase<br/>Authentication · Journal database · Photo storage"]
  Local -. "Migration on sign-in" .-> Cloud

  Pipeline --> Services["Authenticated server functions<br/>AI recognition · Place notes · Itinerary import · Ratings"]
  App --> Services
  Services <--> Cloud
  Services --> AI["Lovable AI gateway<br/>Gemini"]
  Services --> Places["Google Places<br/>Restaurant ratings"]
  Explore --> Maps["React Leaflet + Esri tiles<br/>City markers and journey line"]
```

**Core idea:** travelers capture memories, review suggestions, and revisit a journal organized by trip and city. Guests save locally; signed-in accounts use Supabase. External AI and ratings requests run through authenticated server functions. The journey map sits inside the Trip overview.

This is a source-based architecture overview, not a verification of deployed services.

Sources: [navigation](../src/components/AppShell.tsx), [journal data](../src/lib/touri.ts), [photo pipeline](../src/lib/uploadQueue.ts), [guest storage](../src/lib/guestStore.ts), [server integrations](../src/lib/ai.functions.ts), [journey map](../src/components/JourneyMap.tsx).
