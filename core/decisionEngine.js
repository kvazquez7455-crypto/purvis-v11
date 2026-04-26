export function decisionEngine(input) {
  if (!input) return "test";

  const lower = input.toLowerCase();

  if (lower.includes("video") || lower.includes("youtube")) {
    return "video";
  }

  if (lower.includes("legal") || lower.includes("court")) {
    return "legal";
  }

  if (lower.includes("money") || lower.includes("bid") || lower.includes("estimate")) {
    return "business";
  }

  return "test";
}
