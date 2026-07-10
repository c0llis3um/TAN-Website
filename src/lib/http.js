/** Parse JSON from a fetch Response without throwing on empty or non-JSON bodies. */
export async function safeJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
