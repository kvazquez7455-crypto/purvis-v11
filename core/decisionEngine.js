// PURVIS v11 — Decision Engine
// Routes input text to the correct module key based on keyword matching
// Falls back to "chat" for general conversation

export function decisionEngine(input) {
  if (!input) return "chat";

  const lower = input.toLowerCase();

  // Legal
  if (lower.includes("legal") || lower.includes("court") || lower.includes("motion") || lower.includes("napue") || lower.includes("1.540") || lower.includes("case ")) {
    return "legal";
  }

  // Video / YouTube
  if (lower.includes("video") || lower.includes("youtube") || lower.includes("thumbnail") || lower.includes("shorts")) {
    return "video";
  }

  // Content creation
  if (lower.includes("content") || lower.includes("hook") || lower.includes("script") || lower.includes("hashtag") || lower.includes("viral") || lower.includes("niche")) {
    return "content";
  }

  // Business / Leads
  if (lower.includes("money") || lower.includes("bid") || lower.includes("estimate") || lower.includes("lead") || lower.includes("crm") || lower.includes("revenue") || lower.includes("sales")) {
    return "business";
  }

  // Plumbing
  if (lower.includes("plumb") || lower.includes("ipc") || lower.includes("dfu") || lower.includes("pipe") || lower.includes("drain") || lower.includes("fixture")) {
    return "plumbing";
  }

  // Research
  if (lower.includes("research") || lower.includes("analyze") || lower.includes("study") || lower.includes("report") || lower.includes("investigate")) {
    return "research";
  }

  // Image
  if (lower.includes("image") || lower.includes("picture") || lower.includes("photo") || lower.includes("generate image") || lower.includes("dall")) {
    return "image";
  }

  // Music
  if (lower.includes("music") || lower.includes("song") || lower.includes("beat") || lower.includes("suno") || lower.includes("udio")) {
    return "music";
  }

  // Email
  if (lower.includes("email") || lower.includes("draft email") || lower.includes("send email") || lower.includes("mail")) {
    return "email";
  }

  // Social
  if (lower.includes("social") || lower.includes("repurpose") || lower.includes("instagram") || lower.includes("tiktok") || lower.includes("facebook") || lower.includes("twitter")) {
    return "social";
  }

  // Workflow
  if (lower.includes("workflow") || lower.includes("automate") || lower.includes("automation") || lower.includes("schedule")) {
    return "workflow";
  }

  // Agent
  if (lower.includes("agent") || lower.includes("spawn") || lower.includes("sub-agent")) {
    return "agent";
  }

  // Scraper / Search
  if (lower.includes("search") || lower.includes("scrape") || lower.includes("browse") || lower.includes("find online")) {
    return "scraper";
  }

  // Briefing
  if (lower.includes("briefing") || lower.includes("daily brief") || lower.includes("morning report") || lower.includes("today's plan")) {
    return "briefing";
  }

  // Default: general chat
  return "chat";
}
