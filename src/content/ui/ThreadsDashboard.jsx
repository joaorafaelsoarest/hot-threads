import React from 'react';

function itemsFor(data, key) {
  const items = key === 'pinned'
    ? (Array.isArray(data?.pinned) ? data.pinned : data?.fixadas)
    : (Array.isArray(data?.trending) ? data.trending : (data?.emAltaHoje || data?.hotToday));
  return Array.isArray(items) ? items : [];
}

function itemTitle(item) {
  if (typeof item === 'string') return item;
  return item?.title || item?.name || item?.threadId || item?.id || 'Thread sem título';
}

function ThreadList({ items, emptyLabel, onOpenThread, onUnpinThread, showEmpty, showUnpin, unpinningIds }) {
  if (!items.length) {
    if (!showEmpty) return null;
    return React.createElement('p', { className: 'dashboard-empty' }, emptyLabel);
  }

  return React.createElement(
    'ul',
    { className: 'thread-list' },
    items.map((item, index) => React.createElement(
      'li',
      { key: item?.id || item?.url || `${itemTitle(item)}-${index}` },
      React.createElement(
        'div',
        { className: 'thread-row' },
        React.createElement(
          'div',
          { className: 'thread-main' },
          React.createElement('button', {
            type: 'button',
            className: 'thread-link',
            onClick: () => onOpenThread?.(item)
          }, itemTitle(item)),
          item?.stale === true && React.createElement(
            'span',
            { className: 'stale-badge' },
            'Sem acesso há 14 dias'
          ),
          !showUnpin && Number.isFinite(item?.accessCount) && React.createElement(
            'span',
            { className: 'thread-meta' },
            `${item.accessCount} ${item.accessCount === 1 ? 'acesso' : 'acessos'}`
          )
        ),
        showUnpin && React.createElement('button', {
          type: 'button',
          className: 'unpin-button',
          title: `Desafixar ${itemTitle(item)}`,
          'aria-label': `Desafixar ${itemTitle(item)}`,
          disabled: unpinningIds?.has?.(item?.id),
          onClick: () => onUnpinThread?.(item)
        }, 'Desafixar')
      )
    ))
  );
}

export function ThreadsDashboard({
  status = 'loading',
  data = {},
  errorMessage = '',
  onBack,
  onRetry,
  onOpenThread,
  onUnpinThread,
  unpinningIds,
  actionError = ''
}) {
  const pinned = itemsFor(data, 'pinned');
  const trending = itemsFor(data, 'trending');
  const hasItems = pinned.length > 0 || trending.length > 0;

  return React.createElement(
    'div',
    { className: 'dashboard-shell', 'data-hot-threads-dashboard-shell': '' },
    React.createElement(
      'header',
      { className: 'dashboard-header' },
      React.createElement(
        'div',
        null,
        React.createElement('p', { className: 'dashboard-kicker' }, 'Hot Threads'),
        React.createElement('h1', null, 'Threads')
      ),
      React.createElement('button', { type: 'button', className: 'back-button', onClick: onBack }, 'Voltar')
    ),
    status === 'loading' && React.createElement(
      'p',
      { role: 'status', 'aria-live': 'polite', className: 'dashboard-status' },
      'Carregando threads…'
    ),
    status === 'error' && React.createElement(
      'div',
      { role: 'alert', 'aria-live': 'assertive', className: 'dashboard-error' },
      React.createElement('p', null, errorMessage || 'Não foi possível carregar o painel.'),
      React.createElement('button', { type: 'button', className: 'retry-button', onClick: onRetry }, 'Tentar novamente')
    ),
    actionError && React.createElement(
      'p',
      { role: 'alert', 'aria-live': 'assertive', className: 'dashboard-error' },
      actionError
    ),
    status === 'ready' && !hasItems && React.createElement(
      'p',
      { role: 'status', 'aria-live': 'polite', className: 'dashboard-status' },
      'Nenhuma thread disponível ainda.'
    ),
    React.createElement(
      'main',
      { className: 'dashboard-sections' },
      React.createElement(
        'section',
        { 'aria-labelledby': 'hot-threads-pinned' },
        React.createElement('h2', { id: 'hot-threads-pinned' }, 'Fixadas'),
        React.createElement(ThreadList, {
          items: pinned,
          emptyLabel: 'Nenhuma thread fixada.',
          onOpenThread,
          onUnpinThread,
          showUnpin: true,
          unpinningIds,
          showEmpty: status === 'ready'
        })
      ),
      React.createElement(
        'section',
        { 'aria-labelledby': 'hot-threads-trending' },
        React.createElement('h2', { id: 'hot-threads-trending' }, 'Em alta hoje'),
        React.createElement(ThreadList, {
          items: trending,
          emptyLabel: 'Nenhuma thread em alta hoje.',
          onOpenThread,
          unpinningIds,
          showEmpty: status === 'ready'
        })
      )
    )
  );
}
