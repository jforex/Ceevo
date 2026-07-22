// Country-specific CV/resume norms. Extend anytime.
export const COUNTRY_RULES: Record<string, string> = {
  US: [
    "1 page (2 max for senior). No photo, no age, no marital status.",
    "Call it a 'resume'. Reverse-chronological. Strong action verbs + quantified results.",
    "No personal pronouns. Include a short skills section.",
  ].join(" "),
  UK: [
    "Call it a 'CV'. 2 pages standard. No photo.",
    "Personal statement at top. British spelling. Quantified achievements.",
  ].join(" "),
  EU: [
    "Europass-style acceptable. Photo often expected. 1-2 pages.",
    "May include nationality, languages (CEFR levels), and date of birth where customary.",
  ].join(" "),
  GULF: [
    "Photo, nationality, and visa status commonly expected. 2 pages fine.",
    "Include languages and a personal details section.",
  ].join(" "),
};

export const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  EU: "European Union",
  GULF: "Gulf / Middle East",
};