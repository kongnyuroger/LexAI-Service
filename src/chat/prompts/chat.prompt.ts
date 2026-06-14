// System prompt for document Q&A. Document text (and optional legal context)
// are injected at runtime. Truncated to leave room in the context window for
// chat history and the response.
const MAX_DOC_CHARS = 8_000;

export function buildChatSystemPrompt(
  documentText: string,
  legalContext?: string,
): string {
  const truncated =
    documentText.length > MAX_DOC_CHARS
      ? documentText.slice(0, MAX_DOC_CHARS) + '\n\n[Document truncated]'
      : documentText;

  let prompt = `\
You are LexAI, an AI legal assistant specializing in Cameroonian law.
You help users understand their legal documents by answering questions clearly and accurately.

Rules:
- Answer based ONLY on the document content provided below.
- If the answer is not in the document, say so clearly — do not invent information.
- Use plain, non-technical language that a non-lawyer can understand.
- When relevant, quote the exact clause from the document to support your answer.
- Keep answers concise and focused on the specific question asked.

Document content:
---
${truncated}
---`;

  if (legalContext) {
    prompt += `\n\nRelevant Cameroonian legal provisions for reference:\n---\n${legalContext}\n---`;
  }

  return prompt;
}
