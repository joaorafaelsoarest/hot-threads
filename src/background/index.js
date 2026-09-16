import {
  cleanupExpiredLogs,
  getThreadState,
  recordAccess,
  togglePin,
  upsertThread
} from './db.js';
import { getDashboard, unpinThread } from './dashboard-query.js';
import { parseThreadUrl } from './route-parser.js';
import {
  failure,
  GET_DASHBOARD,
  GET_THREAD_STATE,
  OPEN_THREAD,
  success,
  SYNC_THREAD,
  TOGGLE_PIN,
  UNPIN_THREAD
} from '../shared/protocol.js';

function hasValidSenderTab(sender) {
  return Number.isInteger(sender?.tab?.id) && sender.tab.id >= 0;
}

function validateSenderTab(sender) {
  return hasValidSenderTab(sender)
    ? null
    : failure('INVALID_SENDER', 'Sender tab is required');
}

function parseValidThread(thread) {
  if (!thread || typeof thread !== 'object' || typeof thread.id !== 'string' ||
    typeof thread.spaceId !== 'string' || thread.spaceId.length === 0 ||
    typeof thread.threadId !== 'string' || thread.threadId.length === 0 ||
    typeof thread.title !== 'string' || typeof thread.url !== 'string') {
    return null;
  }

  const route = parseThreadUrl(thread.url);
  if (!route || route.id !== thread.id || route.spaceId !== thread.spaceId || route.threadId !== thread.threadId) {
    return null;
  }

  return {
    ...route,
    title: thread.title || `Thread ${route.threadId}`
  };
}

async function trackThreadUrl(rawUrl, title) {
  const route = parseThreadUrl(rawUrl);
  if (!route) {
    return null;
  }

  const thread = await upsertThread({
    ...route,
    title: title || `Thread ${route.threadId}`
  });
  await recordAccess(thread);
  return thread;
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  return trackThreadUrl(changeInfo?.url || tab?.url, tab?.title).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  return cleanupExpiredLogs().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  return cleanupExpiredLogs().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void Promise.resolve()
    .then(async () => {
      if (!message || typeof message !== 'object') {
        return failure('INVALID_MESSAGE', 'Message must be an object');
      }

      switch (message.type) {
        case SYNC_THREAD: {
          const thread = parseValidThread(message.thread);
          if (!thread) {
            return failure('INVALID_THREAD', 'Thread must contain a valid matching Chat URL');
          }
          return success(await trackThreadUrl(thread.url, thread.title));
        }
        case GET_THREAD_STATE:
          if (typeof message.threadId !== 'string' || message.threadId.length === 0) {
            return failure('INVALID_MESSAGE', 'Thread ID is required');
          }
          return success((await getThreadState(message.threadId)) ?? null);
        case TOGGLE_PIN: {
          const thread = parseValidThread(message.thread);
          if (!thread) {
            return failure('INVALID_THREAD', 'Thread must contain a valid matching Chat URL');
          }
          return success(await togglePin(thread));
        }
        case GET_DASHBOARD: {
          const senderError = validateSenderTab(sender);
          if (senderError) return senderError;
          await cleanupExpiredLogs();
          return success(await getDashboard());
        }
        case UNPIN_THREAD: {
          const senderError = validateSenderTab(sender);
          if (senderError) return senderError;
          if (typeof message.threadId !== 'string' || message.threadId.length === 0) {
            return failure('INVALID_MESSAGE', 'Thread ID is required');
          }
          return success(await unpinThread(message.threadId));
        }
        case OPEN_THREAD: {
          const senderError = validateSenderTab(sender);
          if (senderError) return senderError;
          if (typeof message.url !== 'string' || !parseThreadUrl(message.url)) {
            return failure('INVALID_THREAD_URL', 'URL must be a valid Chat or Gmail thread URL');
          }
          await chrome.tabs.update(sender.tab.id, { url: message.url });
          return success({ url: message.url });
        }
        default:
          return failure('UNKNOWN_MESSAGE', 'Unknown message type');
      }
    })
    .then((response) => {
      try {
        sendResponse(response);
      } catch {
        // Chrome may close the response channel before an asynchronous reply.
      }
    })
    .catch((error) => {
      try {
        sendResponse(failure('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error'));
      } catch {
        // Chrome may close the response channel before an asynchronous reply.
      }
    });

  return true;
});
