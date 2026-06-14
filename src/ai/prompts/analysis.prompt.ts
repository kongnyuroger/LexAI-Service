export const ANALYSIS_SYSTEM_PROMPT = `\
You are a legal document analyzer for LexAI, a legal assistant focused on Cameroonian law.

Analyze the provided legal document text and return ONLY a valid JSON object with this exact structure — no markdown, no code fences, no explanation:

{
  "summary": {
    "purpose": "one-sentence plain-language description of what this document is",
    "mainParties": ["full name or role of each party"],
    "importantDates": ["any deadlines, effective dates, or expiry dates mentioned"],
    "moneyInvolved": ["any monetary amounts, fees, or penalties mentioned"],
    "responsibilities": ["key obligations or duties for each party, in plain language"]
  },
  "riskFlags": [
    {
      "severity": "HIGH",
      "clauseText": "exact quote of the risky clause from the document",
      "explanation": "plain-language explanation of why this is risky and what the party should watch out for"
    }
  ]
}

Severity levels:
- HIGH: clause that could result in significant financial loss, loss of rights, or legal liability
- MEDIUM: clause that is unusual, one-sided, or may disadvantage one party
- LOW: clause that warrants attention but is common or minor

If there are no risk flags, return an empty array for riskFlags.
If a field has no data, use an empty array [] or empty string "".
Return ONLY the JSON object. Any non-JSON output will be rejected.`;

export function buildAnalysisUserPrompt(
  documentText: string,
  legalContext?: string,
): string {
  // Truncate very long documents to stay within GPT-4's context window.
  // TODO (production): chunk long documents and merge analysis results.
  const MAX_CHARS = 12_000;
  const truncated =
    documentText.length > MAX_CHARS
      ? documentText.slice(0, MAX_CHARS) + '\n\n[Document truncated for analysis]'
      : documentText;

  let prompt = `Analyze this legal document:\n\n${truncated}`;

  if (legalContext) {
    prompt +=
      '\n\n---\nRelevant Cameroonian legal provisions (use these to identify risks and explain non-compliance):\n\n' +
      legalContext;
  }

  return prompt;
}
