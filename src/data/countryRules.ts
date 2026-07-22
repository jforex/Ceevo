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
  CA: [
    "1-2 pages. No photo, no age. Call it a 'resume'.",
    "Reverse-chronological. Bilingual (English/French) roles value French where relevant.",
  ].join(" "),
  EU: [
    "Europass-style acceptable. Photo often expected. 1-2 pages.",
    "May include nationality, languages (CEFR levels), and date of birth where customary.",
  ].join(" "),
  DE: [
    "Photo commonly expected (professional headshot). 1-2 pages, 'Lebenslauf'.",
    "Include date of birth, nationality, and a signature line. Very structured and factual.",
  ].join(" "),
  FR: [
    "Photo common. 1 page preferred, 'CV'. French spelling.",
    "Concise. May include age, marital status, and a short profile.",
  ].join(" "),
  AU: [
    "2-3 pages acceptable. No photo. Call it a 'resume' or 'CV'.",
    "Include a professional summary. Australian spelling. Emphasize outcomes.",
  ].join(" "),
  AE: [
    "Photo, nationality, and visa status commonly expected. 2 pages fine.",
    "Include languages and a personal details section.",
  ].join(" "),
  SG: [
    "1-2 pages. Photo optional. Include nationality/PR status and expected salary if asked.",
    "Concise, results-focused. Emphasize regional/APAC experience.",
  ].join(" "),
  IN: [
    "1-2 pages. Photo optional. Include a career objective at the top.",
    "List technical skills prominently. Mention notice period for experienced roles.",
  ].join(" "),
  NG: [
    "1-2 pages. Call it a 'CV'. Photo optional.",
    "Include a personal profile, state of origin sometimes expected, and references available on request.",
  ].join(" "),
  ZA: [
    "2 pages. Call it a 'CV'. Include ID number context and languages.",
    "Personal profile at top. Emphasize BEE/level context where relevant.",
  ].join(" "),
};

export const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  CA: "Canada",
  EU: "European Union",
  DE: "Germany",
  FR: "France",
  AU: "Australia",
  AE: "United Arab Emirates",
  SG: "Singapore",
  IN: "India",
  NG: "Nigeria",
  ZA: "South Africa",
};