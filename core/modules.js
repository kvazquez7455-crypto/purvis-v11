// PURVIS v11 — Full Module Registry
// Each module: accepts input string + context, returns result string
// Used by: orchestrator → decisionEngine → taskEngine → toolExecutor

export const modules = {

  test: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete("You are PURVIS, a private AI operator.", input);
      }
      return `PURVIS received: ${input}`;
    }
  },

  chat: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(context.systemPrompt || "You are PURVIS.", input);
      }
      return `[CHAT] ${input}`;
    }
  },

  content: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a viral content strategist. Generate engaging, platform-ready content.",
          `Create content for: ${input}`
        );
      }
      return `[CONTENT] Generated for: ${input}`;
    }
  },

  legal: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a legal document specialist familiar with Florida law, Orange County courts, Napue v. Illinois, Rule 1.540(b), and family law procedures. Draft precise, court-ready documents.",
          input
        );
      }
      return `[LEGAL] Drafted for: ${input}`;
    }
  },

  video: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a YouTube and video content optimizer. Provide titles, descriptions, tags, thumbnail ideas, and scripts.",
          input
        );
      }
      return `[VIDEO] Optimized: ${input}`;
    }
  },

  business: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a business strategist focused on plumbing services, lead generation, and revenue growth in Orlando FL.",
          input
        );
      }
      return `[BUSINESS] Strategy for: ${input}`;
    }
  },

  research: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a world-class research analyst. Provide comprehensive, sourced analysis.",
          input, { max_tokens: 3000 }
        );
      }
      return `[RESEARCH] Analysis of: ${input}`;
    }
  },

  image: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are an image prompt engineer. Create detailed, vivid prompts for DALL-E or Midjourney.",
          `Create an image prompt for: ${input}`
        );
      }
      return `[IMAGE] Prompt: ${input}`;
    }
  },

  music: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a music production AI. Create detailed prompts for Suno and Udio with style, tempo, instruments, and vibe.",
          input
        );
      }
      return `[MUSIC] Generated for: ${input}`;
    }
  },

  plumbing: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a master plumber and IPC code expert. Reference International Plumbing Code, Florida Building Code, DFU calculations, and provide accurate technical answers.",
          input
        );
      }
      return `[PLUMBING] Answer for: ${input}`;
    }
  },

  email: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a professional email writer. Draft clear, effective emails.",
          input
        );
      }
      return `[EMAIL] Drafted: ${input}`;
    }
  },

  social: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a social media strategist. Repurpose content for YouTube, TikTok, Instagram, Facebook, and Twitter with platform-specific formatting.",
          input
        );
      }
      return `[SOCIAL] Repurposed: ${input}`;
    }
  },

  workflow: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are an automation architect. Design efficient, repeatable workflows with steps, tools, and triggers.",
          input
        );
      }
      return `[WORKFLOW] Built for: ${input}`;
    }
  },

  agent: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a specialized sub-agent. Execute the assigned task with precision and return actionable results.",
          input
        );
      }
      return `[AGENT] Executed: ${input}`;
    }
  },

  scraper: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        return await context.aiComplete(
          "You are a research assistant with broad knowledge. Provide comprehensive analysis.",
          `Research and analyze: ${input}`, { max_tokens: 2500 }
        );
      }
      return `[SCRAPER] Searched: ${input}`;
    }
  },

  briefing: {
    run: async (input, context) => {
      if (context?.aiComplete) {
        const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        return await context.aiComplete(
          "You are PURVIS. Generate a comprehensive daily briefing for Kelvin Vazquez.",
          `Date: ${today}. ${input || "Include priorities, content schedule, legal case status (2024-DR-012028-O), lead targets, plumbing tasks, and scripture."}`
        );
      }
      return `[BRIEFING] Generated for today`;
    }
  }
};
