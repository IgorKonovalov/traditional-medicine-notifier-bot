/**
 * ALL user-facing strings. Russian only, polite "вы". Never inline a Russian
 * string in a handler — add it here. Bodies delivered via the Notifier are
 * plain text with emoji for emphasis (no `parse_mode`, ADR 002).
 *
 * Skeleton: copy is intentionally minimal and will be expanded as commands are
 * built. The structure (one section per command + a shared `common` block) is
 * the contract to keep.
 */

/** The informational disclaimer. Surfaced in /start, /help, and herb pages. */
const disclaimer =
  '⚠️ Бот носит образовательный характер и не даёт медицинских рекомендаций, ' +
  'диагнозов или назначений. Перед применением любых средств проконсультируйтесь с врачом.';

export const messages = {
  disclaimer,

  common: {
    notRegistered: 'Пожалуйста, отправьте /start, чтобы начать.',
    error: 'Что-то пошло не так. Попробуйте ещё раз позже.',
    sessionExpired: 'Сессия истекла. Откройте раздел заново.',
    cancelled: 'Отменено.',
    rateLimited: 'Слишком много запросов. Подождите немного.',
    notImplemented: 'Этот раздел ещё в разработке.',
  },

  start: {
    welcome:
      'Здравствуйте! Это справочник по китайской и тибетской традиционной медицине ' +
      'с напоминаниями и подписками.\n\n' +
      'Команды: /browse — травы, /search — поиск, /reminders — напоминания, ' +
      '/subscriptions — подписки, /settings — настройки, /help — справка.\n\n' +
      disclaimer,
  },

  help: {
    body:
      'Доступные команды:\n' +
      '• /browse — список трав по традициям и категориям\n' +
      '• /search — поиск травы по названию\n' +
      '• /reminders — ваши напоминания (создать, посмотреть, отключить)\n' +
      '• /subscriptions — подписки на темы и ежедневный совет\n' +
      '• /settings — настройки\n' +
      '• /donate — поддержать проект\n' +
      '• /feedback — написать разработчику\n\n' +
      disclaimer,
  },

  settings: {
    title: 'Настройки',
    dailyTipOn: 'Ежедневный совет включён.',
    dailyTipOff: 'Ежедневный совет выключен.',
  },

  browse: {
    title: 'Травы',
    empty: 'Пока нет доступных трав.',
  },

  search: {
    prompt: 'Введите название травы для поиска:',
    nothingFound: 'Ничего не найдено. Попробуйте другое название.',
  },

  reminders: {
    title: 'Ваши напоминания',
    empty: 'У вас пока нет напоминаний. Создайте первое.',
    created: 'Напоминание создано.',
    cancelled: 'Напоминание отключено.',
  },

  subscriptions: {
    title: 'Подписки',
    empty: 'У вас пока нет подписок.',
    subscribed: 'Вы подписались.',
    unsubscribed: 'Вы отписались.',
  },

  donate: {
    intro: 'Поддержать проект можно добровольным донатом в Telegram Stars. Спасибо! 🙏',
    thanks: 'Спасибо за поддержку! ⭐️',
  },

  feedback: {
    prompt: 'Напишите ваше сообщение разработчику одним сообщением:',
    sent: 'Спасибо! Сообщение отправлено.',
  },

  // ─── notification bodies (delivered via the Notifier) ───────────────────────

  reminder: {
    /** Body of a fired user-scheduled reminder. */
    body: (label: string): string => `⏰ Напоминание: ${label}`,
  },

  tip: {
    /** Wraps a daily-tip body pulled from content. */
    daily: (body: string): string => `🌿 Совет дня\n\n${body}`,
  },
} as const;
