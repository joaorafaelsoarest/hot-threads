const CHAT_ROUTE = /^\/app\/chat\/([^/]+)\/topic\/([^/]+)\/?$/;
const GMAIL_HASH_ROUTE = /^#chat\/space\/([^/]+)\/topic\/([^/]+)\/?$/;

export function parseThreadUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  const match = url.hostname === 'chat.google.com'
    ? url.pathname.match(CHAT_ROUTE)
    : url.hostname === 'mail.google.com' && url.pathname.startsWith('/chat/')
      ? url.hash.match(GMAIL_HASH_ROUTE)
      : null;

  if (!match) {
    return null;
  }

  const [, spaceId, threadId] = match;
  return {
    id: `space/${spaceId}/topic/${threadId}`,
    spaceId,
    threadId,
    url: rawUrl
  };
}
